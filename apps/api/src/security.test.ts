import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { guides, sessions } from "./db/schema.ts";
import { createToken, hashToken, SESSION_COOKIE } from "./lib/auth.ts";
import {
  createGuide,
  createManagedBuilding,
  createUser,
  jsonRequest,
  TEST_ORIGIN,
  testEnv,
  useTestApp,
  withCookie,
} from "./test/helpers.ts";

const t = useTestApp();
const DAY_MS = 24 * 60 * 60 * 1000;
const kakaoEnv = {
  KAKAO_REST_API_KEY: "test-rest-api-key",
  KAKAO_CLIENT_SECRET: "test-client-secret",
};

function cookiePair(response: Response, name: string) {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  return header?.split(";")[0];
}

/** 세션 행을 직접 만듭니다(생성일·마지막 사용일을 과거로 두기 위해). */
async function insertSession(values: { userId: string; createdAt: Date; lastSeenAt: Date }) {
  const token = createToken();
  await t.db.insert(sessions).values({
    userId: values.userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 10 * DAY_MS),
    createdAt: values.createdAt,
    lastSeenAt: values.lastSeenAt,
  });
  return { cookie: `${SESSION_COOKIE}=${token}`, tokenHash: hashToken(token) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("request limits and cross-site requests", () => {
  it("rejects bodies over 64 KB with 413 PAYLOAD_TOO_LARGE", async () => {
    // Given
    const body = { token: "x".repeat(70 * 1024) };
    // When
    const response = await t.app.request("/api/manager-invites/preview", jsonRequest("POST", body));
    // Then
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: { code: "PAYLOAD_TOO_LARGE" } });
  });

  it("refuses form posts from another origin even with a valid session", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const draft = await createGuide(t.db, building.id);
    const crossSite = {
      method: "POST",
      headers: {
        Cookie: managerCookie,
        Origin: "https://evil.example",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "",
    };
    // When
    const publish = await t.app.request(`/api/guides/${draft.id}/publish`, crossSite);
    const logout = await t.app.request("/api/auth/logout", crossSite);
    // Then
    expect(publish.status).toBe(403);
    expect(await publish.json()).toEqual({ error: { code: "FORBIDDEN" } });
    expect(logout.status).toBe(403);
    const [stored] = await t.db.select().from(guides).where(eq(guides.id, draft.id));
    expect(stored?.status).toBe("draft");
  });

  it("ignores status, buildingId and publishedAt sent in create and edit bodies", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const other = await createManagedBuilding(t.db);
    const extra = { status: "published", buildingId: other.building.id, publishedAt: new Date() };
    // When
    const created = await t.app.request(
      `/api/buildings/${building.id}/guides`,
      jsonRequest(
        "POST",
        { category: "parcel", title: "택배", body: "본문", ...extra },
        managerCookie,
      ),
    );
    const { id } = (await created.json()) as { id: string };
    const edited = await t.app.request(
      `/api/guides/${id}`,
      jsonRequest("PATCH", { title: "택배 보관", ...extra }, managerCookie),
    );
    // Then
    expect(created.status).toBe(201);
    expect(edited.status).toBe(200);
    const [stored] = await t.db.select().from(guides).where(eq(guides.id, id));
    expect(stored).toMatchObject({ buildingId: building.id, status: "draft", publishedAt: null });
  });
});

describe("sessions", () => {
  it("extends a session used after a day without passing the 90-day cap", async () => {
    // Given
    const userId = await createUser(t.db);
    const { cookie, tokenHash } = await insertSession({
      userId,
      createdAt: new Date(Date.now() - 85 * DAY_MS),
      lastSeenAt: new Date(Date.now() - 2 * DAY_MS),
    });
    // When
    const response = await t.app.request("/api/me", withCookie(cookie));
    // Then
    expect(response.status).toBe(200);
    expect(cookiePair(response, SESSION_COOKIE)).toBeDefined();
    const [stored] = await t.db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
    const cap = Date.now() - 85 * DAY_MS + 90 * DAY_MS;
    expect(stored?.expiresAt.getTime()).toBeLessThanOrEqual(cap + 1000);
  });

  it("ends a session 90 days after login even if it was used every day", async () => {
    // Given
    const userId = await createUser(t.db);
    const { cookie } = await insertSession({
      userId,
      createdAt: new Date(Date.now() - 91 * DAY_MS),
      lastSeenAt: new Date(),
    });
    // When
    const response = await t.app.request("/api/me", withCookie(cookie));
    // Then
    expect(response.status).toBe(401);
  });

  it("revokes the previous session when logging in again and sets Secure on https", async () => {
    // Given
    const app = createApp({
      env: testEnv({ DEMO_MODE: "true", APP_ORIGIN: "https://wolgye.example" }),
      db: t.db,
    });
    const login = { as: "demo-landlord" };
    const post = (cookie?: string) => ({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://wolgye.example",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(login),
    });
    // When
    const first = await app.request("/api/dev/login", post());
    const firstCookie = cookiePair(first, SESSION_COOKIE) ?? "";
    const second = await app.request("/api/dev/login", post(firstCookie));
    const oldMe = await app.request("/api/me", { headers: { Cookie: firstCookie } });
    // Then
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers.getSetCookie().join()).toContain("Secure");
    expect(oldMe.status).toBe(401);
  });
});

describe("login redirects", () => {
  it.each([
    "/\\evil.example",
    "/.//evil.example",
    "/a/..//evil.example",
    "/%2F%2Fevil.example",
    "/a%0d%0aLocation:%20x",
    "/a%09b",
  ])("rejects returnTo %s", async (returnTo) => {
    // Given
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    // When
    const response = await app.request(
      `/api/auth/kakao/start?returnTo=${encodeURIComponent(returnTo)}`,
    );
    // Then
    expect(response.status).toBe(400);
  });

  it("keeps ordinary same-site paths with a query", async () => {
    // Given
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    // When
    const response = await app.request("/api/auth/kakao/start?returnTo=/manage/abc?x=1");
    // Then
    expect(response.status).toBe(302);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("treats a forged unsigned state cookie as a failed login", async () => {
    // Given
    const app = createApp({ env: testEnv(kakaoEnv), db: t.db });
    const forged = `wh_oauth=${encodeURIComponent(JSON.stringify({ state: "s", returnTo: "/" }))}`;
    vi.stubGlobal("fetch", vi.fn());
    // When
    const response = await app.request(
      "/api/auth/kakao/callback?code=c&state=s",
      withCookie(forged),
    );
    // Then
    expect(response.headers.get("Location")).toBe(`${TEST_ORIGIN}/?login=failed`);
    expect(cookiePair(response, SESSION_COOKIE)).toBeUndefined();
  });
});

describe("api docs", () => {
  it("serves docs outside production and hides them in production unless API_DOCS=true", async () => {
    // Given
    const local = createApp({ env: testEnv(), db: t.db });
    const prod = createApp({ env: testEnv({ NODE_ENV: "production" }), db: t.db });
    const devServer = createApp({
      env: testEnv({ NODE_ENV: "production", API_DOCS: "true" }),
      db: t.db,
    });
    // When
    const localSpec = await local.request("/api/openapi.json");
    const prodSpec = await prod.request("/api/openapi.json");
    const prodSwagger = await prod.request("/api/swagger");
    const devSpec = await devServer.request("/api/openapi.json");
    // Then
    expect(localSpec.status).toBe(200);
    expect(prodSpec.status).toBe(404);
    expect(prodSwagger.status).toBe(404);
    expect(devSpec.status).toBe(200);
  });
});
