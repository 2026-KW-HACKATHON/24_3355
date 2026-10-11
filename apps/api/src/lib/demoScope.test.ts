import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DEMO_BUILDING_ID, DEMO_E2E_BUILDING_ID } from "../db/demo.ts";
import { buildingManagers, buildings, occupancies, users } from "../db/schema.ts";
import {
  createBuilding,
  createInvite,
  jsonRequest,
  sessionCookie,
  setJoinCode,
  useTestApp,
} from "../test/helpers.ts";

const t = useTestApp();

/** 시연 로그인 계정과 같은 kakao_user_id를 가진 사용자. 이미 있으면 그 행을 씁니다. */
async function demoUser(kakaoUserId: string) {
  await t.db.insert(users).values({ kakaoUserId }).onConflictDoNothing();
  const [row] = await t.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.kakaoUserId, kakaoUserId));
  if (!row) throw new Error("demo user missing");
  return row.id;
}

describe("demo accounts stay in demo buildings", () => {
  it("refuses a demo account accepting an invite to a real building", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const token = await createInvite(t.db, building.id);
    const cookie = await sessionCookie(t.db, await demoUser("demo-e2e-landlord"));
    // When
    const response = await t.app.request(
      "/api/manager-invites/accept",
      jsonRequest("POST", { token }, cookie),
    );
    // Then
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "FORBIDDEN", fields: { account: "demo" } },
    });
    const managers = await t.db
      .select()
      .from(buildingManagers)
      .where(eq(buildingManagers.buildingId, building.id));
    expect(managers).toHaveLength(0);
  });

  it("refuses a demo account connecting to a real building with its join code", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "KW2026");
    const userId = await demoUser("demo-e2e-landlord");
    const cookie = await sessionCookie(t.db, userId);
    // When
    const response = await t.app.request(
      `/api/buildings/${building.id}/occupancies`,
      jsonRequest("POST", { code: "KW2026" }, cookie),
    );
    // Then
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "FORBIDDEN", fields: { account: "demo" } },
    });
    const rows = await t.db
      .select()
      .from(occupancies)
      .where(and(eq(occupancies.buildingId, building.id), eq(occupancies.userId, userId)));
    expect(rows).toHaveLength(0);
  });

  it("still lets the e2e landlord accept invites to the e2e building", async () => {
    // Given
    await t.db
      .insert(buildings)
      .values({
        id: DEMO_E2E_BUILDING_ID,
        name: "테스트빌라",
        displayAddress: "서울 노원구 월계동",
        fullAddress: "서울 노원구 월계동 1",
        status: "preparing",
      })
      .onConflictDoNothing();
    const token = await createInvite(t.db, DEMO_E2E_BUILDING_ID);
    const cookie = await sessionCookie(t.db, await demoUser("demo-e2e-landlord"));
    // When
    const response = await t.app.request(
      "/api/manager-invites/accept",
      jsonRequest("POST", { token }, cookie),
    );
    // Then
    expect(response.status).toBe(200);
  });

  it("does not limit ordinary Kakao accounts", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const token = await createInvite(t.db, building.id);
    await t.db.insert(users).values({ kakaoUserId: "4100000001" }).onConflictDoNothing();
    const [user] = await t.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.kakaoUserId, "4100000001"));
    const cookie = await sessionCookie(t.db, user?.id ?? "");
    // When
    const response = await t.app.request(
      "/api/manager-invites/accept",
      jsonRequest("POST", { token }, cookie),
    );
    // Then
    expect(response.status).toBe(200);
  });
});

describe("the presentation demo is read-only (D-35)", () => {
  const ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99";
  /** 쓰기 경로 묶음마다 하나씩. 막히는지만 보므로 본문·id는 아무 값이어도 됩니다. */
  const WRITES: readonly [string, string][] = [
    ["POST", `/api/buildings/${ID}/guides`],
    ["PATCH", `/api/guides/${ID}`],
    ["POST", `/api/guides/${ID}/publish`],
    ["DELETE", `/api/guides/${ID}/revision`],
    ["POST", `/api/guides/${ID}/correction-memos`],
    ["POST", `/api/correction-memos/${ID}/keep`],
    ["POST", `/api/buildings/${ID}/notices`],
    ["POST", `/api/notices/${ID}/opened`],
    ["POST", `/api/buildings/${ID}/photos`],
    ["POST", `/api/buildings/${ID}/occupancies`],
    ["POST", `/api/occupancies/${ID}/move-out`],
    ["POST", `/api/occupancies/${ID}/reconfirm`],
    ["POST", `/api/buildings/${ID}/join-code`],
    ["POST", `/api/buildings/${ID}/reports`],
    ["POST", `/api/reports/${ID}/acknowledge`],
    ["POST", `/api/reports/${ID}/resolve`],
    ["POST", `/api/buildings/${ID}/tips`],
    ["PATCH", `/api/tips/${ID}`],
    ["DELETE", `/api/tips/${ID}`],
    ["POST", `/api/tips/${ID}/content-reports`],
    ["POST", "/api/push-subscriptions"],
    ["DELETE", "/api/push-subscriptions"],
    ["PATCH", `/api/manage/buildings/${ID}`],
    ["POST", `/api/manage/buildings/${ID}/confirm`],
    ["POST", "/api/manager-invites/accept"],
  ];
  const demo = useTestApp({ DEMO_MODE: "true" });

  async function codeOf(response: Response) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; fields?: Record<string, string> };
    };
    return `${response.status} ${body.error?.code ?? ""} ${body.error?.fields?.["account"] ?? ""}`.trim();
  }

  it("refuses every write family for the presentation demo accounts, but not reads", async () => {
    for (const as of ["demo-landlord", "demo-resident-a", "demo-resident-b"]) {
      // Given
      const cookie = await sessionCookie(t.db, await demoUser(as));
      for (const [method, path] of WRITES) {
        // When
        const response = await t.app.request(path, jsonRequest(method, {}, cookie));
        // Then
        expect(`${as} ${method} ${path} ${await codeOf(response)}`).toBe(
          `${as} ${method} ${path} 403 FORBIDDEN demo-readonly`,
        );
      }
      const me = await t.app.request("/api/me", jsonRequest("GET", undefined, cookie));
      expect(me.status).toBe(200);
      const building = await t.app.request(`/api/buildings/${DEMO_BUILDING_ID}`);
      expect(building.status).not.toBe(403);
    }
  });

  it("still lets them switch roles, end the demo, log out and record consent", async () => {
    const cookie = await sessionCookie(t.db, await demoUser("demo-resident-a"));
    const consent = await t.app.request(
      "/api/me/terms-consent",
      jsonRequest("POST", { version: "old" }, cookie),
    );
    expect(consent.status).not.toBe(403);
    const login = await demo.app.request(
      "/api/dev/login",
      jsonRequest("POST", { as: "demo-landlord" }, cookie),
    );
    expect(login.status).toBe(200);
    const next =
      login.headers
        .getSetCookie()
        .find((v) => v.startsWith("wh_session="))
        ?.split(";")[0] ?? "";
    const end = await demo.app.request("/api/dev/end-demo", jsonRequest("POST", {}, next));
    expect(end.status).toBe(204);
    const other = await sessionCookie(t.db, await demoUser("demo-resident-b"));
    const logout = await t.app.request("/api/auth/logout", jsonRequest("POST", {}, other));
    expect(logout.status).toBe(204);
  });

  it("refuses anyone's writes to the presentation demo buildings, including guest reports", async () => {
    // When
    const guest = await t.app.request(
      `/api/buildings/${DEMO_BUILDING_ID}/reports`,
      jsonRequest("POST", { source: "custom", kind: "other", body: "시연 건물 제보" }),
    );
    const lookup = await t.app.request(
      `/api/buildings/${DEMO_BUILDING_ID}/reports/lookup`,
      jsonRequest("POST", { tokens: ["x".repeat(43)] }),
    );
    const upper = await t.app.request(
      `/api/buildings/${DEMO_BUILDING_ID.toUpperCase()}/reports`,
      jsonRequest("POST", { source: "custom", kind: "other", body: "대문자 id 시연 건물 제보" }),
    );
    // Then: 확인 토큰 조회(바꾸지 않음)는 그대로이고, 대문자로 쓴 같은 id도 막힙니다.
    expect(await codeOf(guest)).toBe("403 FORBIDDEN demo-readonly");
    expect(await codeOf(upper)).toBe("403 FORBIDDEN demo-readonly");
    expect(lookup.status).not.toBe(403);
  });

  it("leaves real accounts on real buildings and the e2e demo building writable", async () => {
    // Given
    await t.db.insert(users).values({ kakaoUserId: "4100000002" }).onConflictDoNothing();
    const [real] = await t.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.kakaoUserId, "4100000002"));
    const building = await createBuilding(t.db, "open");
    const realCookie = await sessionCookie(t.db, real?.id ?? "");
    const e2eCookie = await sessionCookie(t.db, await demoUser("demo-e2e-landlord"));
    // When
    const report = await t.app.request(
      `/api/buildings/${building.id}/reports`,
      jsonRequest("POST", { source: "custom", kind: "other", body: "실제 건물 제보" }, realCookie),
    );
    const e2eWrite = await t.app.request(
      `/api/manage/buildings/${DEMO_E2E_BUILDING_ID}`,
      jsonRequest("PATCH", { name: "" }, e2eCookie),
    );
    // Then
    expect(report.status).toBe(201);
    expect(e2eWrite.status).not.toBe(403);
  });
});
