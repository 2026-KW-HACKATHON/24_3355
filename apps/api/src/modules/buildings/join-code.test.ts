import { and, eq, isNull, ne } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { joinCodeAttempts, joinCodes } from "../../db/schema.ts";
import {
  createBuilding,
  createManagedBuilding,
  createUser,
  jsonRequest,
  sessionCookie,
  setJoinCode,
  useTestApp,
  withCookie,
} from "../../test/helpers.ts";

// 요청마다 X-Forwarded-For로 클라이언트 IP를 정합니다(프록시 한 단계를 믿음).
const t = useTestApp({ TRUSTED_PROXY_HOPS: "1" });

function check(buildingId: string, code: string, ip = "198.51.100.1", cookie?: string) {
  const init = jsonRequest("POST", { code }, cookie);
  return t.app.request(`/api/buildings/${buildingId}/join-code/check`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), "X-Forwarded-For": ip },
  });
}

describe("landlord join code", () => {
  it("has no code until the manager creates one, then shows the current code", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    // When
    const before = await t.app.request(
      `/api/buildings/${building.id}/join-code`,
      withCookie(managerCookie),
    );
    const created = await t.app.request(
      `/api/buildings/${building.id}/join-code`,
      withCookie(managerCookie, { method: "POST" }),
    );
    const after = await t.app.request(
      `/api/buildings/${building.id}/join-code`,
      withCookie(managerCookie),
    );
    // Then
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({ joinCode: null });
    expect(created.status).toBe(201);
    const { code } = await created.json();
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    expect(await after.json()).toEqual({ joinCode: { code, createdAt: expect.any(String) } });
  });

  it("retires the old code on rotation so only the new one connects", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const oldCode = await setJoinCode(t.db, building.id, "WK72P4");
    // When
    const rotated = await t.app.request(
      `/api/buildings/${building.id}/join-code`,
      withCookie(managerCookie, { method: "POST" }),
    );
    const { code: newCode } = await rotated.json();
    const withOld = await check(building.id, oldCode);
    const withNew = await check(building.id, newCode);
    // Then
    expect(withOld.status).toBe(409);
    expect(withNew.status).toBe(200);
    const current = await t.db
      .select()
      .from(joinCodes)
      .where(and(eq(joinCodes.buildingId, building.id), isNull(joinCodes.retiredAt)));
    expect(current.map((row) => row.code)).toEqual([newCode]);
  });

  it("refuses accounts that do not manage the building", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const strangerCookie = await sessionCookie(t.db, await createUser(t.db));
    // When
    const view = await t.app.request(
      `/api/buildings/${building.id}/join-code`,
      withCookie(strangerCookie),
    );
    const rotate = await t.app.request(
      `/api/buildings/${building.id}/join-code`,
      withCookie(strangerCookie, { method: "POST" }),
    );
    const anonymous = await t.app.request(`/api/buildings/${building.id}/join-code`);
    // Then
    expect(view.status).toBe(403);
    expect(await view.json()).toEqual({ error: { code: "NOT_BUILDING_MANAGER" } });
    expect(rotate.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });
});

describe("join code check", () => {
  it("accepts the code pasted in lower case or with a separator and names the building", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "WK72P4");
    // When
    const plain = await check(building.id, "WK72P4");
    const pasted = await check(building.id, " wk7-2p4 ");
    // Then
    expect(plain.status).toBe(200);
    expect(await plain.json()).toEqual({ buildingId: building.id, buildingName: "테스트빌라" });
    expect(pasted.status).toBe(200);
  });

  it("answers 409 for a wrong code, 400 for a malformed one and 404 for an unknown building", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "WK72P4");
    // When
    const wrong = await check(building.id, "AAAAAA");
    const malformed = await check(building.id, "WK72");
    const unknown = await check(crypto.randomUUID(), "WK72P4");
    // Then
    expect(wrong.status).toBe(409);
    expect(await wrong.json()).toEqual({ error: { code: "JOIN_CODE_INVALID" } });
    expect(malformed.status).toBe(400);
    expect(unknown.status).toBe(404);
  });

  it("locks the client for 10 minutes on the 5th wrong code, even for the right code", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "WK72P4");
    for (let i = 0; i < 4; i++) {
      expect((await check(building.id, "AAAAAA")).status).toBe(409);
    }
    // When
    const fifth = await check(building.id, "AAAAAA");
    const right = await check(building.id, "WK72P4");
    const otherClient = await check(building.id, "WK72P4", "203.0.113.9");
    // Then
    expect(fifth.status).toBe(429);
    expect(await fifth.json()).toEqual({ error: { code: "JOIN_CODE_LOCKED" } });
    const retryAfter = Number(fifth.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(590);
    expect(retryAfter).toBeLessThanOrEqual(600);
    expect(right.status).toBe(429);
    expect(Number(right.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(otherClient.status).toBe(200);
  });

  it("lets the client try again after the lock ends and clears its failures on success", async () => {
    // Given: the lock ended a moment ago
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "WK72P4");
    for (let i = 0; i < 5; i++) await check(building.id, "AAAAAA");
    await t.db
      .update(joinCodeAttempts)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(
        and(
          eq(joinCodeAttempts.buildingId, building.id),
          ne(joinCodeAttempts.clientKey, "building"),
        ),
      );
    // When
    const response = await check(building.id, "WK72P4");
    // Then: the client's record is gone; the building-wide count keeps every attempt
    expect(response.status).toBe(200);
    const rows = await t.db
      .select()
      .from(joinCodeAttempts)
      .where(eq(joinCodeAttempts.buildingId, building.id));
    // 틀린 5번은 건물 기록을 쓰고, 맞힌 확인은 쓴 한 칸을 돌려받습니다.
    expect(rows.map((row) => [row.clientKey, row.failedCount])).toEqual([["building", 5]]);
  });

  it("counts a wrong code for a building that has no code yet", async () => {
    // Given
    const building = await createBuilding(t.db, "preparing");
    // When
    const response = await check(building.id, "WK72P4");
    // Then
    expect(response.status).toBe(409);
    const [attempt] = await t.db
      .select()
      .from(joinCodeAttempts)
      .where(
        and(
          eq(joinCodeAttempts.buildingId, building.id),
          ne(joinCodeAttempts.clientKey, "building"),
        ),
      );
    expect(attempt).toMatchObject({ failedCount: 1, lockedUntil: null });
    expect(attempt?.clientKey).toMatch(/^ip:[0-9a-f]{64}$/);
  });

  it("counts one IPv6 /64 and an IPv4 with its mapped form as the same client", async () => {
    // Given: 5 wrong codes from different addresses of one /64 and one IPv4
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "WK72P4");
    for (let i = 1; i <= 5; i++) await check(building.id, "AAAAAA", `2001:db8:5:6::${i}`);
    for (let i = 1; i <= 5; i++) await check(building.id, "AAAAAA", "192.0.2.77");
    // When
    const sameSubnet = await check(building.id, "WK72P4", "2001:db8:5:6:abcd::99");
    const otherSubnet = await check(building.id, "WK72P4", "2001:db8:5:7::1");
    const mapped = await check(building.id, "WK72P4", "::ffff:192.0.2.77");
    // Then
    expect(sameSubnet.status).toBe(429);
    expect(otherSubnet.status).toBe(200);
    expect(mapped.status).toBe(429);
  });

  it("keeps counting a logged-in user across IP addresses", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "WK72P4");
    const cookie = await sessionCookie(t.db, await createUser(t.db));
    for (let i = 0; i < 5; i++) await check(building.id, "AAAAAA", `192.0.2.${i + 1}`, cookie);
    // When
    const response = await check(building.id, "WK72P4", "192.0.2.99", cookie);
    // Then
    expect(response.status).toBe(429);
  });
});
