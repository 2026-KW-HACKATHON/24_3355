import { TERMS_VERSION } from "@wolgyeham/contracts";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.ts";
import { DEMO_BUILDING_ID, DEMO_E2E_BUILDING_ID, seedDemo } from "../../db/demo.ts";
import { pushSubscriptions, users } from "../../db/schema.ts";
import {
  createManagedBuilding,
  createPushSubscription,
  createUser,
  jsonRequest,
  sessionCookie,
  testEnv,
  useTestApp,
  withCookie,
} from "../../test/helpers.ts";

const t = useTestApp();
const demo = useTestApp({ DEMO_MODE: "true" });
const kakaoEnv = {
  KAKAO_REST_API_KEY: "test-rest-api-key",
  KAKAO_CLIENT_SECRET: "test-client-secret",
};

/** 우리 화면의 링크·버튼으로 이동할 때 브라우저가 붙이는 헤더. */
const SAME_ORIGIN_NAVIGATION = { "Sec-Fetch-Site": "same-origin" };

async function endpointsOf(userId: string) {
  const rows = await t.db
    .select({ endpoint: pushSubscriptions.endpoint })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return rows.map((row) => row.endpoint);
}

/** Set-Cookie 헤더에서 `이름=값`만 꺼냅니다. */
function cookiePair(response: Response, name: string) {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  return header?.split(";")[0];
}

describe("me and sessions", () => {
  it("answers 401 without a session", async () => {
    // When
    const response = await t.app.request("/api/me");
    // Then
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
  });

  it("returns the user with managed buildings and no occupancy", async () => {
    // Given
    const { building, managerId, managerCookie } = await createManagedBuilding(t.db);
    // When
    const response = await t.app.request("/api/me", withCookie(managerCookie));
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { id: managerId, termsVersion: null, termsAgreedAt: null, termsUpToDate: false },
      managedBuildings: [{ id: building.id, name: "테스트빌라" }],
      occupancy: null,
    });
  });

  it("ignores an expired session", async () => {
    // Given
    const cookie = await sessionCookie(t.db, await createUser(t.db), -1000);
    // When
    const response = await t.app.request("/api/me", withCookie(cookie));
    // Then
    expect(response.status).toBe(401);
  });

  it("logs out by deleting the session", async () => {
    // Given
    const cookie = await sessionCookie(t.db, await createUser(t.db));
    // When
    const logout = await t.app.request("/api/auth/logout", withCookie(cookie, { method: "POST" }));
    const after = await t.app.request("/api/me", withCookie(cookie));
    // Then
    expect(logout.status).toBe(204);
    expect(logout.headers.getSetCookie().join()).toContain("wh_session=;");
    expect(after.status).toBe(401);
  });

  it("deletes this browser's push subscription of the user when logout sends its endpoint", async () => {
    // Given: the user has two browsers subscribed, and someone else uses another endpoint
    const userId = await createUser(t.db);
    const cookie = await sessionCookie(t.db, userId);
    const thisBrowser = await createPushSubscription(t.db, userId);
    const otherBrowser = await createPushSubscription(t.db, userId);
    const someoneElse = await createPushSubscription(t.db, await createUser(t.db));
    // When
    const logout = await t.app.request(
      "/api/auth/logout",
      jsonRequest("POST", { pushEndpoint: thisBrowser }, cookie),
    );
    const others = await t.app.request(
      "/api/auth/logout",
      jsonRequest("POST", { pushEndpoint: someoneElse }, await sessionCookie(t.db, userId)),
    );
    const after = await t.app.request("/api/me", withCookie(cookie));
    // Then: only this user's subscription for that browser is gone
    expect(logout.status).toBe(204);
    expect(others.status).toBe(204);
    expect(after.status).toBe(401);
    expect(await endpointsOf(userId)).toEqual([otherBrowser]);
    expect(
      await t.db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, someoneElse)),
    ).toHaveLength(1);
  });

  it("still logs out when the endpoint is unknown or missing, and ignores it without a session", async () => {
    // Given
    const userId = await createUser(t.db);
    const endpoint = await createPushSubscription(t.db, userId);
    // When
    const unknownHost = await t.app.request(
      "/api/auth/logout",
      jsonRequest(
        "POST",
        { pushEndpoint: "https://push.example.com/send/abc" },
        await sessionCookie(t.db, userId),
      ),
    );
    const emptyBody = await t.app.request(
      "/api/auth/logout",
      jsonRequest("POST", {}, await sessionCookie(t.db, userId)),
    );
    const anonymous = await t.app.request(
      "/api/auth/logout",
      jsonRequest("POST", { pushEndpoint: endpoint }),
    );
    const wrongType = await t.app.request(
      "/api/auth/logout",
      jsonRequest("POST", { pushEndpoint: 42 }, await sessionCookie(t.db, userId)),
    );
    // Then
    expect(unknownHost.status).toBe(204);
    expect(emptyBody.status).toBe(204);
    expect(anonymous.status).toBe(204);
    expect(wrongType.status).toBe(400);
    expect(await endpointsOf(userId)).toEqual([endpoint]);
  });
});

describe("demo login", () => {
  beforeAll(async () => {
    await seedDemo(demo.db);
  });

  it("does not exist unless DEMO_MODE is on", async () => {
    // When
    const probe = await t.app.request("/api/dev/login");
    const login = await t.app.request(
      "/api/dev/login",
      jsonRequest("POST", { as: "demo-landlord" }),
    );
    // Then
    expect(probe.status).toBe(404);
    expect(login.status).toBe(404);
  });

  it("logs in as the seeded demo landlord when DEMO_MODE is on", async () => {
    // When
    const probe = await demo.app.request("/api/dev/login");
    const login = await demo.app.request(
      "/api/dev/login",
      jsonRequest("POST", { as: "demo-landlord" }),
    );
    // Then
    expect(probe.status).toBe(204);
    expect(login.status).toBe(200);
    expect((await login.json()).managedBuildings).toContainEqual({
      id: DEMO_BUILDING_ID,
      name: "햇살빌라",
    });
    const setCookie = login.headers.getSetCookie().join();
    expect(setCookie).toMatch(
      /wh_session=[\w-]{43}; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax/,
    );
    expect(setCookie).not.toContain("Secure");
    const cookie = cookiePair(login, "wh_session") ?? "";
    const me = await demo.app.request("/api/me", withCookie(cookie));
    expect(me.status).toBe(200);
  });

  it("logs in as demo resident A connected to 햇살빌라 and B not yet connected", async () => {
    // When
    const a = await demo.app.request(
      "/api/dev/login",
      jsonRequest("POST", { as: "demo-resident-a" }),
    );
    const b = await demo.app.request(
      "/api/dev/login",
      jsonRequest("POST", { as: "demo-resident-b" }),
    );
    // Then
    expect(a.status).toBe(200);
    expect(await a.json()).toMatchObject({
      managedBuildings: [],
      occupancy: { buildingId: DEMO_BUILDING_ID, buildingName: "햇살빌라", status: "active" },
    });
    expect(b.status).toBe(200);
    expect(await b.json()).toMatchObject({ managedBuildings: [], occupancy: null });
  });

  it("logs in as the e2e landlord who manages only the e2e building", async () => {
    // When
    const login = await demo.app.request(
      "/api/dev/login",
      jsonRequest("POST", { as: "demo-e2e-landlord" }),
    );
    // Then
    expect(login.status).toBe(200);
    expect(await login.json()).toMatchObject({
      managedBuildings: [{ id: DEMO_E2E_BUILDING_ID, name: "테스트빌라" }],
      occupancy: null,
    });
  });

  it("rejects unknown demo roles", async () => {
    // When
    const response = await demo.app.request("/api/dev/login", jsonRequest("POST", { as: "admin" }));
    // Then
    expect(response.status).toBe(400);
  });
});

describe("kakao login", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("answers 503 when Kakao is not configured", async () => {
    // When
    const response = await t.app.request("/api/auth/kakao/start?returnTo=/invite");
    // Then
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "KAKAO_NOT_CONFIGURED" } });
  });

  it("redirects to Kakao with a signed state cookie and rejects off-site returnTo", async () => {
    // Given
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    // When
    const start = await app.request("/api/auth/kakao/start?returnTo=/invite");
    const offsite = await app.request("/api/auth/kakao/start?returnTo=//evil.example");
    // Then
    expect(start.status).toBe(302);
    const location = new URL(start.headers.get("Location") ?? "");
    expect(location.origin + location.pathname).toBe("https://kauth.kakao.com/oauth/authorize");
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      client_id: "test-rest-api-key",
      redirect_uri: "http://localhost:5173/api/auth/kakao/callback",
      response_type: "code",
      state: expect.any(String),
    });
    expect(start.headers.getSetCookie().join()).toContain("Path=/api/auth/kakao; HttpOnly");
    expect(offsite.status).toBe(400);
  });

  it("creates a session from the Kakao member id and returns to the page", async () => {
    // Given
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    const kakaoId = Math.floor(Math.random() * 1e12);
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url === "https://kauth.kakao.com/oauth/token") {
        return Response.json({ access_token: "kakao-access-token", token_type: "bearer" });
      }
      // 콘솔에 동의항목이 켜져 있어 카카오가 범위 밖의 값까지 돌려줘도 회원번호만 읽어야 합니다.
      return Response.json({
        id: kakaoId,
        has_signed_up: true,
        properties: { nickname: "프로필닉네임" },
        kakao_account: {
          profile: { nickname: "프로필닉네임", profile_image_url: "http://img.example/p.jpg" },
          email: "someone@example.com",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const logged: unknown[][] = [];
    for (const level of ["info", "warn", "error", "log"] as const) {
      vi.spyOn(console, level).mockImplementation((...args) => {
        logged.push(args);
      });
    }
    const start = await app.request("/api/auth/kakao/start?returnTo=/b/abc?from=qr");
    const state = new URL(start.headers.get("Location") ?? "").searchParams.get("state");
    const oauthCookie = cookiePair(start, "wh_oauth") ?? "";
    // When
    const callback = await app.request(
      `/api/auth/kakao/callback?code=auth-code&state=${state}`,
      withCookie(oauthCookie),
    );
    // Then
    expect(callback.status).toBe(302);
    expect(callback.headers.get("Location")).toBe("http://localhost:5173/b/abc?from=qr");
    const [stored] = await t.db
      .select()
      .from(users)
      .where(eq(users.kakaoUserId, String(kakaoId)));
    expect(stored).toBeDefined();
    const tokenRequest = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(String(tokenRequest?.body)).toContain("client_secret=test-client-secret");
    // Then: the profile request asks only for a non-personal field besides the member id
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [userUrl, userRequest] = fetchMock.mock.calls[1] ?? [];
    expect(String(userUrl)).toBe("https://kapi.kakao.com/v2/user/me");
    expect(userRequest?.method).toBe("POST");
    expect(userRequest?.headers).toMatchObject({
      Authorization: "Bearer kakao-access-token",
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    });
    const userParams = new URLSearchParams(String(userRequest?.body));
    expect([...userParams.keys()]).toEqual(["property_keys"]);
    expect(JSON.parse(userParams.get("property_keys") ?? "")).toEqual(["has_signed_up"]);
    // Then: nothing but the member id is stored or logged
    expect(JSON.stringify(stored)).not.toMatch(/프로필닉네임|someone@example\.com|img\.example/);
    expect(JSON.stringify(logged)).not.toMatch(/프로필닉네임|someone@example\.com|img\.example/);
    const me = await app.request("/api/me", withCookie(cookiePair(callback, "wh_session") ?? ""));
    expect(await me.json()).toMatchObject({ user: { id: stored?.id } });
  });

  it("returns with login=cancelled or login=failed instead of creating a session", async () => {
    // Given
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    const start = await app.request("/api/auth/kakao/start?returnTo=/invite");
    const oauthCookie = cookiePair(start, "wh_oauth") ?? "";
    vi.stubGlobal("fetch", vi.fn());
    // When
    const cancelled = await app.request(
      "/api/auth/kakao/callback?error=access_denied&state=x",
      withCookie(oauthCookie),
    );
    const wrongState = await app.request(
      "/api/auth/kakao/callback?code=c&state=wrong",
      withCookie(oauthCookie),
    );
    const noCookie = await app.request("/api/auth/kakao/callback?code=c&state=wrong");
    // Then
    expect(cancelled.headers.get("Location")).toBe("http://localhost:5173/invite?login=cancelled");
    expect(wrongState.headers.get("Location")).toBe("http://localhost:5173/invite?login=failed");
    expect(noCookie.headers.get("Location")).toBe("http://localhost:5173/?login=failed");
    expect(cookiePair(wrongState, "wh_session")).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns with login=failed when Kakao rejects the code", async () => {
    // Given
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    const start = await app.request("/api/auth/kakao/start?returnTo=/invite");
    const state = new URL(start.headers.get("Location") ?? "").searchParams.get("state");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // When
    const callback = await app.request(
      `/api/auth/kakao/callback?code=bad&state=${state}`,
      withCookie(cookiePair(start, "wh_oauth") ?? ""),
    );
    // Then
    expect(callback.headers.get("Location")).toBe("http://localhost:5173/invite?login=failed");
  });
});

describe("terms consent (D-28)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * 카카오가 이 회원번호를 돌려준다고 두고, 로그인 시작 → 콜백까지 갑니다. `startHeaders`는 로그인 시작 요청의
   * 헤더이고, 기본은 우리 화면에서 누른 것(`Sec-Fetch-Site: same-origin`)입니다.
   */
  async function kakaoLogin(
    app: ReturnType<typeof createApp>,
    kakaoId: number,
    startQuery: string,
    tamper?: (oauthCookie: string) => string,
    startHeaders: Record<string, string> = SAME_ORIGIN_NAVIGATION,
  ) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        String(input) === "https://kauth.kakao.com/oauth/token"
          ? Response.json({ access_token: "kakao-access-token" })
          : Response.json({ id: kakaoId }),
      ),
    );
    const start = await app.request(`/api/auth/kakao/start?${startQuery}`, {
      headers: startHeaders,
    });
    const state = new URL(start.headers.get("Location") ?? "").searchParams.get("state");
    const oauthCookie = cookiePair(start, "wh_oauth") ?? "";
    const callback = await app.request(
      `/api/auth/kakao/callback?code=auth-code&state=${state}&consent=${TERMS_VERSION}`,
      withCookie(tamper ? tamper(oauthCookie) : oauthCookie),
    );
    return { start, callback };
  }

  async function storedUser(kakaoId: number) {
    const [row] = await t.db
      .select()
      .from(users)
      .where(eq(users.kakaoUserId, String(kakaoId)));
    return row;
  }

  const newKakaoId = () => Math.floor(Math.random() * 1e12);

  it("records the current version carried in the signed state cookie and reports it in /me", async () => {
    // Given
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    const kakaoId = newKakaoId();
    // When
    const { callback } = await kakaoLogin(
      app,
      kakaoId,
      `returnTo=/invite&consent=${TERMS_VERSION}`,
    );
    const me = await app.request("/api/me", withCookie(cookiePair(callback, "wh_session") ?? ""));
    // Then
    expect(callback.headers.get("Location")).toBe("http://localhost:5173/invite");
    expect(await storedUser(kakaoId)).toMatchObject({
      termsVersion: TERMS_VERSION,
      termsAgreedAt: expect.any(Date),
    });
    expect((await me.json()).user).toMatchObject({
      termsVersion: TERMS_VERSION,
      termsAgreedAt: expect.any(String),
      termsUpToDate: true,
    });
  });

  it("keeps the first agreement time on a later login and updates it when the stored version differs", async () => {
    // Given: agreed once
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    const kakaoId = newKakaoId();
    await kakaoLogin(app, kakaoId, `consent=${TERMS_VERSION}`);
    const first = await storedUser(kakaoId);
    // When: logs in again with the same version, then the stored version is an old one
    await kakaoLogin(app, kakaoId, `consent=${TERMS_VERSION}`);
    const same = await storedUser(kakaoId);
    await t.db
      .update(users)
      .set({ termsVersion: "2026-01-01-old", termsAgreedAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(users.kakaoUserId, String(kakaoId)));
    await kakaoLogin(app, kakaoId, `consent=${TERMS_VERSION}`);
    const updated = await storedUser(kakaoId);
    // Then
    expect(same?.termsAgreedAt).toEqual(first?.termsAgreedAt);
    expect(updated?.termsVersion).toBe(TERMS_VERSION);
    expect(updated?.termsAgreedAt?.getTime()).toBeGreaterThan(Date.parse("2026-01-02T00:00:00Z"));
  });

  it("logs in without recording an old version, a missing consent, or a consent only in the callback query", async () => {
    // Given
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    const oldId = newKakaoId();
    const noneId = newKakaoId();
    // When: the callback URL always carries consent=<current> (kakaoLogin), but the cookie does not
    const old = await kakaoLogin(app, oldId, "returnTo=/&consent=2026-01-01-old");
    const none = await kakaoLogin(app, noneId, "returnTo=/");
    // Then
    expect(old.callback.headers.get("Location")).toBe("http://localhost:5173/");
    expect(cookiePair(old.callback, "wh_session")).toBeDefined();
    expect(await storedUser(oldId)).toMatchObject({ termsVersion: null, termsAgreedAt: null });
    expect(cookiePair(none.callback, "wh_session")).toBeDefined();
    expect(await storedUser(noneId)).toMatchObject({ termsVersion: null, termsAgreedAt: null });
  });

  it.each([
    ["a link from another site", { "Sec-Fetch-Site": "cross-site" }],
    ["a same-site but different origin page", { "Sec-Fetch-Site": "same-site" }],
    ["an address typed or bookmarked", { "Sec-Fetch-Site": "none" }],
    [
      "another site even with our Referer",
      { "Sec-Fetch-Site": "cross-site", Referer: "http://localhost:5173/login" },
    ],
    ["no fetch metadata and no Origin or Referer", {}],
    ["no fetch metadata and another site's Referer", { Referer: "https://evil.example/terms" }],
    ["no fetch metadata and another site's Origin", { Origin: "https://evil.example" }],
    ["no fetch metadata and an opaque Origin", { Origin: "null" }],
  ])("logs in but does not record consent from %s", async (_label, headers) => {
    // Given
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    const kakaoId = newKakaoId();
    // When
    const { callback } = await kakaoLogin(
      app,
      kakaoId,
      `returnTo=/invite&consent=${TERMS_VERSION}`,
      undefined,
      headers,
    );
    // Then
    expect(callback.headers.get("Location")).toBe("http://localhost:5173/invite");
    expect(cookiePair(callback, "wh_session")).toBeDefined();
    expect(await storedUser(kakaoId)).toMatchObject({ termsVersion: null, termsAgreedAt: null });
  });

  it.each([
    ["no fetch metadata and our Referer", { Referer: "http://localhost:5173/login?returnTo=/" }],
    ["no fetch metadata and our Origin", { Origin: "http://localhost:5173" }],
  ])("records consent from %s", async (_label, headers) => {
    // Given
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    const kakaoId = newKakaoId();
    // When
    await kakaoLogin(app, kakaoId, `consent=${TERMS_VERSION}`, undefined, headers);
    // Then
    expect(await storedUser(kakaoId)).toMatchObject({ termsVersion: TERMS_VERSION });
  });

  it("rejects a malformed consent before redirecting to Kakao", async () => {
    // Given
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    // When
    const response = await app.request(
      `/api/auth/kakao/start?consent=${encodeURIComponent("2026 draft!")}`,
    );
    // Then
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED", fields: { consent: expect.any(String) } },
    });
  });

  it("does not log in or record consent when the signed state cookie is tampered with", async () => {
    // Given: a login started without consent, then the cookie JSON is edited to add it (signature kept)
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    const other = createApp({
      env: testEnv({ ...kakaoEnv, SESSION_SECRET: "another-test-session-secret-0123456789" }),
      db: t.db,
    });
    const editedId = newKakaoId();
    const foreignId = newKakaoId();
    const addConsent = (pair: string) => {
      const [name, encoded = ""] = pair.split("=");
      const raw = decodeURIComponent(encoded);
      const dot = raw.lastIndexOf(".");
      const saved = { ...JSON.parse(raw.slice(0, dot)), consent: TERMS_VERSION };
      return `${name}=${encodeURIComponent(`${JSON.stringify(saved)}${raw.slice(dot)}`)}`;
    };
    // When: (1) edited payload, (2) a validly signed cookie from a server with a different secret
    const edited = await kakaoLogin(app, editedId, "returnTo=/invite", addConsent);
    const foreignStart = await other.request(
      `/api/auth/kakao/start?returnTo=/invite&consent=${TERMS_VERSION}`,
      { headers: SAME_ORIGIN_NAVIGATION },
    );
    const foreignState = new URL(foreignStart.headers.get("Location") ?? "").searchParams.get(
      "state",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: foreignId, access_token: "t" })),
    );
    const foreign = await app.request(
      `/api/auth/kakao/callback?code=c&state=${foreignState}`,
      withCookie(cookiePair(foreignStart, "wh_oauth") ?? ""),
    );
    // Then
    for (const callback of [edited.callback, foreign]) {
      expect(callback.headers.get("Location")).toBe("http://localhost:5173/?login=failed");
      expect(cookiePair(callback, "wh_session")).toBeUndefined();
    }
    expect(await storedUser(editedId)).toBeUndefined();
    expect(await storedUser(foreignId)).toBeUndefined();
  });

  it("records consent on demo login only when the current version is passed", async () => {
    // Given
    await seedDemo(demo.db);
    await demo.db
      .update(users)
      .set({ termsVersion: null, termsAgreedAt: null })
      .where(eq(users.kakaoUserId, "demo-resident-b"));
    // When
    const without = await demo.app.request(
      "/api/dev/login",
      jsonRequest("POST", { as: "demo-resident-b" }),
    );
    const old = await demo.app.request(
      "/api/dev/login",
      jsonRequest("POST", { as: "demo-resident-b", consent: "2026-01-01-old" }),
    );
    const current = await demo.app.request(
      "/api/dev/login",
      jsonRequest("POST", { as: "demo-resident-b", consent: TERMS_VERSION }),
    );
    const malformed = await demo.app.request(
      "/api/dev/login",
      jsonRequest("POST", { as: "demo-resident-b", consent: "no spaces" }),
    );
    // Then
    expect((await without.json()).user).toMatchObject({ termsVersion: null, termsUpToDate: false });
    expect((await old.json()).user).toMatchObject({ termsVersion: null, termsUpToDate: false });
    expect((await current.json()).user).toMatchObject({
      termsVersion: TERMS_VERSION,
      termsUpToDate: true,
    });
    expect(malformed.status).toBe(400);
  });

  it("refuses a demo login with consent posted as a form from another site", async () => {
    // Given
    await seedDemo(demo.db);
    await demo.db
      .update(users)
      .set({ termsVersion: null, termsAgreedAt: null })
      .where(eq(users.kakaoUserId, "demo-resident-b"));
    const body = JSON.stringify({ as: "demo-resident-b", consent: TERMS_VERSION });
    // When: a cross-site <form enctype="text/plain"> can carry a JSON-looking body, but not a JSON content type
    const crossSite = await demo.app.request("/api/dev/login", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "Sec-Fetch-Site": "cross-site",
        Origin: "https://evil.example",
      },
      body,
    });
    // Then
    expect(crossSite.status).toBe(403);
    const [stored] = await demo.db
      .select({ termsVersion: users.termsVersion })
      .from(users)
      .where(eq(users.kakaoUserId, "demo-resident-b"));
    expect(stored?.termsVersion).toBeNull();
    expect(cookiePair(crossSite, "wh_session")).toBeUndefined();
  });

  it("lets a signed-in user agree to the current version, refusing old versions and anonymous calls", async () => {
    // Given: an existing session without consent still works
    const userId = await createUser(t.db);
    const cookie = await sessionCookie(t.db, userId);
    const before = await t.app.request("/api/me", withCookie(cookie));
    // When
    const old = await t.app.request(
      "/api/me/terms-consent",
      jsonRequest("POST", { version: "2026-01-01-old" }, cookie),
    );
    const agreed = await t.app.request(
      "/api/me/terms-consent",
      jsonRequest("POST", { version: TERMS_VERSION }, cookie),
    );
    const anonymous = await t.app.request(
      "/api/me/terms-consent",
      jsonRequest("POST", { version: TERMS_VERSION }),
    );
    const malformed = await t.app.request(
      "/api/me/terms-consent",
      jsonRequest("POST", { version: "" }, cookie),
    );
    // Then
    expect(before.status).toBe(200);
    expect((await before.json()).user.termsUpToDate).toBe(false);
    expect(old.status).toBe(409);
    expect(await old.json()).toEqual({ error: { code: "CONFLICT" } });
    expect(agreed.status).toBe(200);
    expect((await agreed.json()).user).toMatchObject({
      id: userId,
      termsVersion: TERMS_VERSION,
      termsUpToDate: true,
    });
    expect(anonymous.status).toBe(401);
    expect(malformed.status).toBe(400);
  });
});
