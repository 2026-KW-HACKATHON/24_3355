import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import {
  createBuilding,
  setJoinCode,
  TEST_DATABASE_URL,
  testEnv,
  useTestApp,
} from "../test/helpers.ts";
import { ipKeySecret, isAmplifyProxyAddress, isCloudFrontAddress } from "./client.ts";
import { createDatabase } from "./db.ts";

const SECRET = "origin-verify-secret-for-tests-0123456789";
/** CloudFront 대역(lib/cloudfront-ranges.json)에 든 주소. */
const EDGE_A = "108.138.1.1";
const EDGE_B = "2600:9000:1000::1";
/** EC2 ap-northeast-2 대역에 든 주소(Amplify 호스팅의 /api 프록시). */
const AMPLIFY_PROXY = "13.124.0.10";
/** 사람 주소는 문서용 대역(RFC 5737)만 씁니다. */
const CLIENT = "203.0.113.7";
const ATTACKER = "192.0.2.99";

// /dev/whoami는 DB를 쓰지 않습니다(postgres.js는 첫 쿼리 때 연결).
const database = createDatabase(TEST_DATABASE_URL, { max: 1 });
afterAll(() => database.close());

function appWith(overrides: Record<string, string>) {
  return createApp({ env: testEnv({ DEMO_MODE: "true", ...overrides }), db: database.db });
}

async function whoami(app: ReturnType<typeof appWith>, headers: Record<string, string>) {
  const response = await app.request("/api/dev/whoami", { headers });
  return { status: response.status, body: await response.json() };
}

describe("client address behind CloudFront (ORIGIN_VERIFY_SECRET)", () => {
  const app = appWith({ ORIGIN_VERIFY_SECRET: SECRET });

  const verified = (forwardedFor: string) =>
    whoami(app, { "X-Forwarded-For": forwardedFor, "X-Origin-Verify": SECRET });

  it("picks the client from the Amplify chain: client, Amplify's CloudFront edge, Amplify proxy", async () => {
    // When
    const viaAmplify = await verified(`${CLIENT}, ${EDGE_A}, ${AMPLIFY_PROXY}`);
    // Then
    expect(viaAmplify.body).toEqual({
      forwardedFor: [CLIENT, EDGE_A, AMPLIFY_PROXY],
      socketAddress: "unknown",
      clientAddress: CLIENT,
      mode: "origin-verify",
      originVerify: "matched",
    });
    expect(JSON.stringify(viaAmplify.body)).not.toContain(SECRET);
  });

  it("uses the last hop for requests straight to our CloudFront, so a spoofed prefix does not help", async () => {
    // When
    const direct = await verified(CLIENT);
    // A non-AWS attacker writes "fake, <CloudFront ip>" and CloudFront appends the attacker's real address
    const spoofed = await verified(`198.51.100.66, ${EDGE_A}, ${ATTACKER}`);
    const spoofedIpv6Edge = await verified(`198.51.100.66, ${EDGE_B}, ${ATTACKER}`);
    // Then
    expect(direct.body).toMatchObject({ clientAddress: CLIENT, mode: "origin-verify" });
    expect(spoofed.body).toMatchObject({ clientAddress: ATTACKER });
    expect(spoofedIpv6Edge.body).toMatchObject({ clientAddress: ATTACKER });
  });

  it("documents the remaining gap: a sender inside EC2 ap-northeast-2 can choose the address", async () => {
    // When: an attacker running on an EC2 host in ap-northeast-2 forges the Amplify shape
    const forged = await verified(`198.51.100.66, ${EDGE_A}, 13.124.0.99`);
    // Then: the forged value is used (bounded by the anonymous building-wide join-code cap)
    expect(forged.body).toMatchObject({ clientAddress: "198.51.100.66" });
  });

  it("falls back to the socket address when the header is missing or wrong, or the picked hop is not an IP", async () => {
    // When
    const missing = await whoami(app, { "X-Forwarded-For": CLIENT });
    const wrong = await whoami(app, {
      "X-Forwarded-For": CLIENT,
      "X-Origin-Verify": `${SECRET}x`,
    });
    const invalidLast = await verified(`${CLIENT}, not-an-ip`);
    const invalidClient = await verified(`unknown, ${EDGE_A}, ${AMPLIFY_PROXY}`);
    const empty = await whoami(app, { "X-Origin-Verify": SECRET });
    // Then
    expect(missing.body).toMatchObject({ clientAddress: "unknown", originVerify: "missing" });
    expect(wrong.body).toMatchObject({ clientAddress: "unknown", originVerify: "mismatch" });
    for (const response of [invalidLast, invalidClient, empty]) {
      expect(response.body).toMatchObject({ clientAddress: "unknown", mode: "origin-verify" });
    }
  });

  it("keeps TRUSTED_PROXY_HOPS as the mode without a secret, and hides whoami outside demo mode", async () => {
    // Given
    const hops = appWith({ TRUSTED_PROXY_HOPS: "1" });
    const production = createApp({ env: testEnv({ DEMO_MODE: "false" }), db: database.db });
    // When
    const viaHops = await whoami(hops, { "X-Forwarded-For": "198.51.100.1, 203.0.113.9" });
    const hidden = await production.request("/api/dev/whoami");
    // Then
    expect(viaHops.body).toMatchObject({
      clientAddress: "203.0.113.9",
      mode: "proxy-hops",
      originVerify: "not_configured",
    });
    expect(hidden.status).toBe(404);
  });

  it("recognises CloudFront and EC2 ap-northeast-2 ranges for IPv4, IPv6 and mapped IPv4", () => {
    expect(isCloudFrontAddress(EDGE_A)).toBe(true);
    expect(isCloudFrontAddress(`::ffff:${EDGE_A}`)).toBe(true);
    expect(isCloudFrontAddress(EDGE_B)).toBe(true);
    expect(isCloudFrontAddress(CLIENT)).toBe(false);
    expect(isCloudFrontAddress("not-an-ip")).toBe(false);
    expect(isAmplifyProxyAddress(AMPLIFY_PROXY)).toBe(true);
    expect(isAmplifyProxyAddress("2406:da12::1")).toBe(true);
    expect(isAmplifyProxyAddress(EDGE_A)).toBe(false);
    expect(isAmplifyProxyAddress(CLIENT)).toBe(false);
  });
});

describe("IP key secret", () => {
  it("derives a separate key from SESSION_SECRET with HKDF", () => {
    // Then
    const derived = ipKeySecret("session-secret-0123456789abcdef0123");
    expect(derived).toHaveLength(32);
    expect(derived.equals(Buffer.from("session-secret-0123456789abcdef0123"))).toBe(false);
    expect(ipKeySecret("session-secret-0123456789abcdef0123").equals(derived)).toBe(true);
    expect(ipKeySecret("another-secret-0123456789abcdef0123").equals(derived)).toBe(false);
  });
});

describe("join code lock behind CloudFront", () => {
  const t = useTestApp({ ORIGIN_VERIFY_SECRET: SECRET });

  function check(buildingId: string, code: string, headers: Record<string, string>) {
    return t.app.request(`/api/buildings/${buildingId}/join-code/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", ...headers },
      body: JSON.stringify({ code }),
    });
  }

  it("counts one client whether it comes through Amplify or straight, and not the shared Amplify proxy", async () => {
    // Given: five wrong codes from one client through Amplify (different edges)
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "WK72P4");
    for (let i = 0; i < 5; i++) {
      await check(building.id, "AAAAAA", {
        "X-Forwarded-For": `203.0.113.40, ${i % 2 ? EDGE_A : EDGE_B}, ${AMPLIFY_PROXY}`,
        "X-Origin-Verify": SECRET,
      });
    }
    // When
    const sameClientDirect = await check(building.id, "WK72P4", {
      "X-Forwarded-For": "203.0.113.40",
      "X-Origin-Verify": SECRET,
    });
    const otherClientViaAmplify = await check(building.id, "WK72P4", {
      "X-Forwarded-For": `203.0.113.41, ${EDGE_A}, ${AMPLIFY_PROXY}`,
      "X-Origin-Verify": SECRET,
    });
    // Then: the lock follows the client, not the proxy everyone shares
    expect(sameClientDirect.status).toBe(429);
    expect(otherClientViaAmplify.status).toBe(200);
  });
});
