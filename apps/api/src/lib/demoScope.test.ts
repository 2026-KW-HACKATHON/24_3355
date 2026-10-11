import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DEMO_E2E_BUILDING_ID } from "../db/demo.ts";
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
    const cookie = await sessionCookie(t.db, await demoUser("demo-resident-b"));
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
    const userId = await demoUser("demo-landlord");
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
