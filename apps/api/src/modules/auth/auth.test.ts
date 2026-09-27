import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.ts";
import { users } from "../../db/schema.ts";
import { DEMO_BUILDING_ID, seedDemo } from "../../db/seed.ts";
import {
  createManagedBuilding,
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

  it("returns the user with managed buildings", async () => {
    // Given
    const { building, managerId, managerCookie } = await createManagedBuilding(t.db);
    // When
    const response = await t.app.request("/api/me", withCookie(managerCookie));
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { id: managerId },
      managedBuildings: [{ id: building.id, name: "테스트빌라" }],
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
      return Response.json({ id: kakaoId, kakao_account: { profile: { nickname: "숨김" } } });
    });
    vi.stubGlobal("fetch", fetchMock);
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
