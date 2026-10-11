import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { guides, sessions, users } from "./db/schema.ts";
import { createToken, DEMO_SESSION_MS, hashToken, SESSION_COOKIE } from "./lib/auth.ts";
import {
  createGuide,
  createManagedBuilding,
  createMemo,
  createOccupancy,
  createReport,
  createUser,
  jsonRequest,
  sessionCookie,
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

describe("manager-only routes", () => {
  type Fixture = {
    buildingId: string;
    draftId: string;
    publishedId: string;
    memoId: string;
    reportId: string;
  };
  /**
   * 집주인만 부르는 경로. 본문은 검증을 통과하는 값이라(검증이 권한 확인보다 먼저) 권한 확인까지 닿습니다.
   * 다른 건물 집주인과 같은 건물 거주자는 403 `NOT_BUILDING_MANAGER`, 로그인 전은 401 `UNAUTHENTICATED`입니다.
   */
  const later = new Date(Date.now() + DAY_MS).toISOString();
  const ROUTES: readonly [string, (f: Fixture) => string, unknown][] = [
    ["GET", (f) => `/api/manage/buildings/${f.buildingId}`, undefined],
    ["PATCH", (f) => `/api/manage/buildings/${f.buildingId}`, { name: "바뀐빌라" }],
    ["POST", (f) => `/api/manage/buildings/${f.buildingId}/confirm`, {}],
    [
      "POST",
      (f) => `/api/buildings/${f.buildingId}/guides`,
      { category: "parcel", title: "택배", body: "본문" },
    ],
    ["PATCH", (f) => `/api/guides/${f.draftId}`, { title: "바뀐 제목" }],
    ["POST", (f) => `/api/guides/${f.draftId}/publish`, { applyMemoIds: [] }],
    ["GET", (f) => `/api/guides/${f.publishedId}/revision`, undefined],
    ["DELETE", (f) => `/api/guides/${f.publishedId}/revision`, undefined],
    ["GET", (f) => `/api/buildings/${f.buildingId}/correction-memos`, undefined],
    ["GET", (f) => `/api/correction-memos/${f.memoId}`, undefined],
    ["POST", (f) => `/api/correction-memos/${f.memoId}/keep`, { reason: "지금 안내가 맞아요" }],
    ["GET", (f) => `/api/buildings/${f.buildingId}/notices/audience`, undefined],
    [
      "POST",
      (f) => `/api/buildings/${f.buildingId}/notices`,
      {
        title: "계단 청소",
        body: "오전에 해요",
        startsAt: new Date().toISOString(),
        endsAt: later,
      },
    ],
    ["GET", (f) => `/api/buildings/${f.buildingId}/join-code`, undefined],
    ["POST", (f) => `/api/buildings/${f.buildingId}/join-code`, {}],
    ["GET", (f) => `/api/buildings/${f.buildingId}/reports`, undefined],
    ["POST", (f) => `/api/reports/${f.reportId}/acknowledge`, {}],
    ["POST", (f) => `/api/reports/${f.reportId}/resolve`, { result: "completed" }],
    ["POST", (f) => `/api/buildings/${f.buildingId}/photos`, undefined],
  ];

  const PLACEHOLDER: Fixture = {
    buildingId: ":buildingId",
    draftId: ":guideId",
    publishedId: ":guideId",
    memoId: ":memoId",
    reportId: ":reportId",
  };
  const CASES = ROUTES.map(
    ([method, path, body]) => [`${method} ${path(PLACEHOLDER)}`, method, path, body] as const,
  );

  async function fixture(): Promise<Fixture & { residentCookie: string; otherCookie: string }> {
    const { building } = await createManagedBuilding(t.db, "open");
    const other = await createManagedBuilding(t.db, "open");
    const residentId = await createUser(t.db);
    await createOccupancy(t.db, building.id, residentId);
    const draft = await createGuide(t.db, building.id);
    const published = await createGuide(t.db, building.id, { status: "published", position: 2 });
    const memo = await createMemo(t.db, published.id, residentId);
    const report = await createReport(t.db, building.id);
    return {
      buildingId: building.id,
      draftId: draft.id,
      publishedId: published.id,
      memoId: memo.id,
      reportId: report.id,
      residentCookie: await sessionCookie(t.db, residentId),
      otherCookie: other.managerCookie,
    };
  }

  async function outcome(method: string, path: string, body: unknown, cookie?: string) {
    const init =
      body === undefined
        ? { method, headers: { Origin: TEST_ORIGIN, ...(cookie ? { Cookie: cookie } : {}) } }
        : jsonRequest(method, body, cookie);
    const response = await t.app.request(path, init);
    const json = (await response.json().catch(() => ({}))) as { error?: { code?: string } };
    return `${method} ${path} ${response.status} ${json.error?.code ?? ""}`;
  }

  it.each(CASES)(
    "%s refuses everyone but the building's landlord",
    async (_route, method, path, body) => {
      // Given
      const f = await fixture();
      const url = path(f);
      // When
      const guest = await outcome(method, url, body);
      const otherLandlord = await outcome(method, url, body, f.otherCookie);
      const resident = await outcome(method, url, body, f.residentCookie);
      // Then
      expect(guest).toBe(`${method} ${url} 401 UNAUTHENTICATED`);
      expect(otherLandlord).toBe(`${method} ${url} 403 NOT_BUILDING_MANAGER`);
      expect(resident).toBe(`${method} ${url} 403 NOT_BUILDING_MANAGER`);
    },
  );
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

  it("never extends a demo session and ends it 3 hours after login (D-35)", async () => {
    // Given: 시연 계정(시드 이름과 같은 kakao_user_id)의 세션. 길게 남은 예전 세션도 같은 규칙입니다.
    const [existing] = await t.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.kakaoUserId, "demo-resident-b"))
      .limit(1);
    const userId =
      existing?.id ??
      (await t.db.insert(users).values({ kakaoUserId: "demo-resident-b" }).returning())[0]?.id ??
      "";
    const fresh = await insertSession({
      userId,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      lastSeenAt: new Date(Date.now() - 2 * DAY_MS),
    });
    const old = await insertSession({
      userId,
      createdAt: new Date(Date.now() - DEMO_SESSION_MS - 60_000),
      lastSeenAt: new Date(),
    });
    const [before] = await t.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, fresh.tokenHash));
    // When
    const used = await t.app.request("/api/me", withCookie(fresh.cookie));
    const expired = await t.app.request("/api/me", withCookie(old.cookie));
    // Then
    expect(used.status).toBe(200);
    expect(cookiePair(used, SESSION_COOKIE)).toBeUndefined();
    const [after] = await t.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, fresh.tokenHash));
    expect(after?.expiresAt.getTime()).toBe(before?.expiresAt.getTime());
    expect(expired.status).toBe(401);
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
