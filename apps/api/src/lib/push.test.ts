import { createECDH, randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import https from "node:https";
import url from "node:url";
import { isAllowedPushEndpoint } from "@wolgyeham/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import webPush from "web-push";
import { testEnv } from "../test/helpers.ts";
import { createWebPushSender } from "./push.ts";

// web-push는 모킹하지 않습니다(암호화·VAPID·url.parse를 실제로 거침). 네트워크만 https.request에서 가로챕니다.

/** 브라우저 구독처럼 유효한 키(P-256 공개키, 16바이트 auth). 테스트마다 새로 만듭니다. */
function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

/** 테스트마다 새로 만든 VAPID 키(어디에도 저장하지 않음). */
function vapidEnv() {
  const keys = webPush.generateVAPIDKeys();
  return testEnv({
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: "mailto:team@example.invalid",
  });
}

class FakeResponse extends EventEmitter {
  constructor(readonly statusCode: number) {
    super();
  }
}

class FakeRequest extends EventEmitter {
  destroyed = false;
  body: unknown;
  end(body?: unknown) {
    this.body = body;
    return this;
  }
  destroy(error?: Error) {
    if (this.destroyed) return this;
    this.destroyed = true;
    if (error) queueMicrotask(() => this.emit("error", error));
    return this;
  }
}

type Scenario = (request: FakeRequest) => void;

/** https.request를 가로채 옵션을 모으고, 시나리오대로 응답합니다. */
function interceptHttps(scenario: Scenario) {
  const calls: { options: https.RequestOptions; request: FakeRequest }[] = [];
  vi.spyOn(https, "request").mockImplementation(((options: https.RequestOptions) => {
    const request = new FakeRequest();
    calls.push({ options, request });
    queueMicrotask(() => scenario(request));
    return request;
  }) as unknown as typeof https.request);
  return calls;
}

const respondWith =
  (status: number): Scenario =>
  (request) => {
    const response = new FakeResponse(status);
    request.emit("response", response);
    response.emit("end");
  };

function jwtAudience(authorization: string | undefined) {
  const token = /t=([^,]+)/.exec(authorization ?? "")?.[1] ?? "";
  const payload = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(payload, "base64url").toString()).aud;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** 해석기마다 호스트를 다르게 읽는 주소(보안 리뷰에서 재현). 레거시 url.parse는 공격자 호스트로 연결합니다. */
const DIFFERENTIAL_ENDPOINTS = [
  "https://attacker.example;.push.apple.com/x",
  "https://attacker.example'.push.apple.com/x",
  'https://attacker.example".push.apple.com/x',
  "https://attacker.example{.push.apple.com/x",
  "https://attacker.example}.push.apple.com/x",
  "https://attacker.example`.push.apple.com/x",
  "https://attacker.example%3B.push.apple.com/x",
  "https://127.0.0.1;.push.apple.com/x",
];

describe("isAllowedPushEndpoint against legacy url.parse", () => {
  it("rejects every endpoint where url.parse would connect somewhere else", () => {
    for (const endpoint of DIFFERENTIAL_ENDPOINTS) {
      // Given: web-push가 쓰는 레거시 해석은 허용 목록 밖 호스트로 읽습니다
      const legacyHost = url.parse(endpoint).hostname ?? "";
      expect(legacyHost.endsWith(".push.apple.com")).toBe(false);
      // Then
      expect(isAllowedPushEndpoint(endpoint)).toBe(false);
    }
  });

  it("accepts real endpoints only when url.parse and WHATWG URL agree on the host", () => {
    const endpoints = [
      "https://fcm.googleapis.com/fcm/send/abc:APA91b-x_y",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB",
      "https://web.push.apple.com/QGx5-abc_def",
      "https://wns2-by3p.notify.windows.com/w/?token=BQYAAAB%2b",
    ];
    for (const endpoint of endpoints) {
      expect(isAllowedPushEndpoint(endpoint)).toBe(true);
      expect(url.parse(endpoint).hostname).toBe(new URL(endpoint).hostname);
    }
    for (const endpoint of [
      "https://FCM.googleapis.com/x",
      "https://fcm.googleapis.com./x",
      "https://fcm.googleapis.com",
      " https://fcm.googleapis.com/x",
      "https://fcm.googleapis.com/x\ty",
      "https://push.apple.com/x",
    ]) {
      expect(isAllowedPushEndpoint(endpoint)).toBe(false);
    }
  });
});

describe("createWebPushSender", () => {
  it("stays disabled without VAPID keys", async () => {
    // Given
    const calls = interceptHttps(respondWith(201));
    const sender = createWebPushSender(testEnv());
    // When
    const configured = await sender.isConfigured();
    const result = await sender.send(
      { endpoint: "https://fcm.googleapis.com/fcm/send/a", ...browserKeys() },
      "{}",
    );
    // Then
    expect(configured).toBe(false);
    expect(result).toBe("failed");
    expect(calls).toHaveLength(0);
  });

  it("refuses to start with malformed keys, naming keys but not values", () => {
    // Given
    const env = testEnv({
      VAPID_PUBLIC_KEY: "not-a-real-public-key",
      VAPID_PRIVATE_KEY: "not-a-real-private-key",
      VAPID_SUBJECT: "mailto:team@example.invalid",
    });
    // When
    const create = () => createWebPushSender(env);
    // Then
    expect(create).toThrow("Invalid environment variables: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY");
    expect(create).not.toThrow(/not-a-real/);
  });

  it("connects to the checked host with a fresh agent and a VAPID audience for that host", async () => {
    // Given
    const calls = interceptHttps(respondWith(201));
    const sender = createWebPushSender(vapidEnv());
    const target = { endpoint: "https://web.push.apple.com/QGx5?x=1", ...browserKeys() };
    // When
    const first = await sender.send(target, '{"type":"notice"}');
    const second = await sender.send(target, '{"type":"notice"}');
    // Then
    expect([first, second]).toEqual(["sent", "sent"]);
    const [call, next] = calls;
    expect(call?.options).toMatchObject({
      hostname: "web.push.apple.com",
      servername: "web.push.apple.com",
      port: 443,
      path: "/QGx5?x=1",
      method: "POST",
    });
    expect(call?.options.agent).toBeInstanceOf(https.Agent);
    expect(next?.options.agent).not.toBe(call?.options.agent);
    const headers = call?.options.headers as Record<string, string>;
    expect(jwtAudience(headers["Authorization"])).toBe("https://web.push.apple.com");
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(Buffer.isBuffer(call?.request.body)).toBe(true);
  });

  it("maps push service answers to sent, gone and failed", async () => {
    // Given
    const statuses = [201, 202, 404, 410, 413, 429, 500];
    const results = [];
    const sender = createWebPushSender(vapidEnv());
    const target = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...browserKeys() };
    // When
    for (const status of statuses) {
      interceptHttps(respondWith(status));
      results.push(await sender.send(target, "{}"));
      vi.restoreAllMocks();
    }
    interceptHttps((request) => request.emit("error", new Error("ECONNRESET")));
    results.push(await sender.send(target, "{}"));
    // Then
    expect(results).toEqual([
      "sent",
      "sent",
      "gone",
      "gone",
      "failed",
      "failed",
      "failed",
      "failed",
    ]);
  });

  it("never contacts endpoints that fail the allowlist, even if stored earlier", async () => {
    // Given
    const calls = interceptHttps(respondWith(201));
    const sender = createWebPushSender(vapidEnv());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // When
    const results = await Promise.all(
      [...DIFFERENTIAL_ENDPOINTS, "https://push.example.invalid/x"].map((endpoint) =>
        sender.send({ endpoint, ...browserKeys() }, "{}"),
      ),
    );
    // Then
    expect(new Set(results)).toEqual(new Set(["failed"]));
    expect(calls).toHaveLength(0);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("attacker");
  });

  it("gives up at the hard deadline when the push service never answers", async () => {
    // Given
    const calls = interceptHttps(() => {});
    const sender = createWebPushSender(vapidEnv(), { deadlineMs: 30 });
    // When
    const started = Date.now();
    const result = await sender.send(
      { endpoint: "https://fcm.googleapis.com/fcm/send/slow", ...browserKeys() },
      "{}",
    );
    // Then
    expect(result).toBe("failed");
    expect(Date.now() - started).toBeLessThan(1000);
    expect(calls[0]?.request.destroyed).toBe(true);
  });

  it("stops reading a response body that keeps coming, without buffering it", async () => {
    // Given: the service answers 201 and then streams far more than 64 KB
    const chunk = Buffer.alloc(16 * 1024, 1);
    const calls = interceptHttps((request) => {
      const response = new FakeResponse(201);
      request.emit("response", response);
      for (let i = 0; i < 10; i++) response.emit("data", chunk);
    });
    const sender = createWebPushSender(vapidEnv());
    // When
    const result = await sender.send(
      { endpoint: "https://fcm.googleapis.com/fcm/send/drip", ...browserKeys() },
      "{}",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Then
    expect(result).toBe("sent");
    expect(calls[0]?.request.destroyed).toBe(true);
  });
});
