import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { correctionMemos, noticeDeliveries, occupancies } from "../../db/schema.ts";
import {
  createGuide,
  createManagedBuilding,
  createMemo,
  createOccupancy,
  createPushSubscription,
  createUser,
  jsonRequest,
  sessionCookie,
  TEST_ORIGIN,
  useTestApp,
  withCookie,
} from "../../test/helpers.ts";

// 설정값이 연결·재확인에 쓰이는지 보려고 기본(365일)과 다른 주기로 앱을 만듭니다.
const t = useTestApp({ RECONFIRM_INTERVAL_DAYS: "30" });
const DAY_MS = 24 * 60 * 60 * 1000;

async function resident(
  buildingId: string,
  status: "active" | "reconfirm_needed" | "inactive" = "active",
  nextReconfirmAt?: Date,
) {
  const userId = await createUser(t.db);
  const occupancy = await createOccupancy(
    t.db,
    buildingId,
    userId,
    status,
    nextReconfirmAt ? { nextReconfirmAt } : {},
  );
  return { userId, occupancy, cookie: await sessionCookie(t.db, userId) };
}

function post(path: string, cookie?: string) {
  return t.app.request(
    path,
    cookie
      ? withCookie(cookie, { method: "POST" })
      : { method: "POST", headers: { Origin: TEST_ORIGIN } },
  );
}

async function me(cookie: string) {
  return (await (await t.app.request("/api/me", withCookie(cookie))).json()).occupancy;
}

describe("reconfirm state computed on read", () => {
  it("shows a pending request in /me once the reconfirm time passes, with 14 days to answer", async () => {
    // Given: the reconfirm time passed a day ago
    const { building } = await createManagedBuilding(t.db, "open");
    const requestedAt = new Date(Date.now() - DAY_MS);
    const a = await resident(building.id, "active", requestedAt);
    // When
    const occupancy = await me(a.cookie);
    // Then: still active (writes and push keep working), but the sheet 40 should show
    expect(occupancy).toMatchObject({
      id: a.occupancy.id,
      buildingName: "테스트빌라",
      status: "active",
      reconfirmRequested: true,
      nextReconfirmAt: requestedAt.toISOString(),
      reconfirmDueAt: new Date(requestedAt.getTime() + 14 * DAY_MS).toISOString(),
    });
  });

  it("treats 14 days without an answer as reconfirm_needed without changing the stored row", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id, "active", new Date(Date.now() - 15 * DAY_MS));
    // When
    const occupancy = await me(a.cookie);
    // Then
    expect(occupancy).toMatchObject({ status: "reconfirm_needed", reconfirmRequested: true });
    const [stored] = await t.db
      .select()
      .from(occupancies)
      .where(eq(occupancies.id, a.occupancy.id));
    expect(stored?.status).toBe("active");
  });

  it("pauses push for reconfirm_needed residents and brings them back after reconfirming", async () => {
    // Given: a subscribed resident whose reconfirm is 15 days overdue
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id, "active", new Date(Date.now() - 15 * DAY_MS));
    await createPushSubscription(t.db, a.userId);
    const audience = async () => {
      const response = await t.app.request(
        `/api/buildings/${building.id}/notices/audience`,
        withCookie(managerCookie),
      );
      return response.json();
    };
    // When
    const paused = await audience();
    const subscribe = await t.app.request(
      "/api/push-subscriptions",
      jsonRequest(
        "POST",
        {
          endpoint: "https://fcm.googleapis.com/fcm/send/overdue",
          keys: { p256dh: "k", auth: "a" },
        },
        a.cookie,
      ),
    );
    const reconfirmed = await post(`/api/occupancies/${a.occupancy.id}/reconfirm`, a.cookie);
    const resumed = await audience();
    // Then
    expect(paused).toEqual({ connectedCount: 0, pushTargetCount: 0 });
    expect(subscribe.status).toBe(403);
    expect(await subscribe.json()).toEqual({ error: { code: "RECONFIRM_NEEDED" } });
    expect(reconfirmed.status).toBe(200);
    expect(resumed).toEqual({ connectedCount: 1, pushTargetCount: 1 });
  });
});

describe("POST /occupancies/:occupancyId/reconfirm", () => {
  it("returns to active, records the answer and asks again after the configured interval", async () => {
    // Given: reconfirm_needed (stored) resident
    const { building } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id, "reconfirm_needed", new Date(Date.now() - 20 * DAY_MS));
    const before = Date.now();
    // When
    const response = await post(`/api/occupancies/${a.occupancy.id}/reconfirm`, a.cookie);
    // Then
    expect(response.status).toBe(200);
    const { occupancy } = await response.json();
    expect(occupancy).toMatchObject({
      id: a.occupancy.id,
      status: "active",
      reconfirmRequested: false,
      endedAt: null,
    });
    expect(Date.parse(occupancy.lastReconfirmedAt)).toBeGreaterThanOrEqual(before - 1000);
    const next = Date.parse(occupancy.nextReconfirmAt) - Date.parse(occupancy.lastReconfirmedAt);
    expect(next).toBeGreaterThan(29.9 * DAY_MS);
    expect(next).toBeLessThan(30.1 * DAY_MS);
    expect(await me(a.cookie)).toMatchObject({ status: "active", reconfirmRequested: false });
  });

  it("reopens writing a memo that reconfirm_needed had paused", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const guide = await createGuide(t.db, building.id, { status: "published" });
    const a = await resident(building.id, "active", new Date(Date.now() - 15 * DAY_MS));
    const write = () =>
      t.app.request(
        `/api/guides/${guide.id}/correction-memos`,
        jsonRequest("POST", { body: "수거 요일이 바뀌었어요" }, a.cookie),
      );
    // When
    const paused = await write();
    await post(`/api/occupancies/${a.occupancy.id}/reconfirm`, a.cookie);
    const resumed = await write();
    // Then
    expect(paused.status).toBe(403);
    expect(await paused.json()).toEqual({ error: { code: "RECONFIRM_NEEDED" } });
    expect(resumed.status).toBe(201);
  });

  it("is only for the owner, and an ended occupancy cannot be reconfirmed", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id);
    const other = await resident(building.id);
    const moved = await resident(building.id, "inactive");
    // When
    const anonymous = await post(`/api/occupancies/${a.occupancy.id}/reconfirm`);
    const byOther = await post(`/api/occupancies/${a.occupancy.id}/reconfirm`, other.cookie);
    const unknown = await post(`/api/occupancies/${crypto.randomUUID()}/reconfirm`, a.cookie);
    const invalid = await post("/api/occupancies/not-a-uuid/reconfirm", a.cookie);
    const ended = await post(`/api/occupancies/${moved.occupancy.id}/reconfirm`, moved.cookie);
    // Then
    expect(anonymous.status).toBe(401);
    expect(byOther.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(invalid.status).toBe(400);
    expect(ended.status).toBe(409);
    expect(await ended.json()).toEqual({ error: { code: "CONFLICT" } });
    const [untouched] = await t.db
      .select()
      .from(occupancies)
      .where(eq(occupancies.id, a.occupancy.id));
    expect(untouched?.lastReconfirmedAt).toBeNull();
  });
});

describe("POST /occupancies/:occupancyId/move-out", () => {
  it("ends the occupancy, clears it from /me and refuses a second move-out", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id, "active", new Date(Date.now() - 20 * DAY_MS));
    // When
    const response = await post(`/api/occupancies/${a.occupancy.id}/move-out`, a.cookie);
    const again = await post(`/api/occupancies/${a.occupancy.id}/move-out`, a.cookie);
    const reconfirm = await post(`/api/occupancies/${a.occupancy.id}/reconfirm`, a.cookie);
    // Then
    expect(response.status).toBe(200);
    const { occupancy } = await response.json();
    expect(occupancy).toMatchObject({
      id: a.occupancy.id,
      status: "inactive",
      reconfirmRequested: false,
    });
    expect(occupancy.endedAt).toEqual(expect.any(String));
    expect(await me(a.cookie)).toBeNull();
    expect(again.status).toBe(409);
    expect(reconfirm.status).toBe(409);
  });

  it("drops the resident from this building's notice push audience and deliveries", async () => {
    // Given: two subscribed residents
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const leaving = await resident(building.id);
    await createPushSubscription(t.db, leaving.userId);
    const staying = await resident(building.id);
    await createPushSubscription(t.db, staying.userId);
    // When
    await post(`/api/occupancies/${leaving.occupancy.id}/move-out`, leaving.cookie);
    const audience = await t.app.request(
      `/api/buildings/${building.id}/notices/audience`,
      withCookie(managerCookie),
    );
    const posted = await t.app.request(
      `/api/buildings/${building.id}/notices`,
      jsonRequest(
        "POST",
        {
          title: "엘리베이터 점검",
          body: "오전 10시부터 1시간",
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + DAY_MS).toISOString(),
        },
        managerCookie,
      ),
    );
    // Then
    expect(await audience.json()).toEqual({ connectedCount: 1, pushTargetCount: 1 });
    expect(posted.status).toBe(201);
    const { notice } = await posted.json();
    const deliveries = await t.db
      .select({ occupancyId: noticeDeliveries.occupancyId })
      .from(noticeDeliveries)
      .where(eq(noticeDeliveries.noticeId, notice.id));
    expect(deliveries).toEqual([{ occupancyId: staying.occupancy.id }]);
  });

  it("ends member features but leaves the memos in the building", async () => {
    // Given: a resident who left a memo
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const guide = await createGuide(t.db, building.id, { status: "published" });
    const a = await resident(building.id);
    const memo = await createMemo(t.db, guide.id, a.userId);
    // When
    await post(`/api/occupancies/${a.occupancy.id}/move-out`, a.cookie);
    const read = await t.app.request(
      `/api/guides/${guide.id}/correction-memos`,
      withCookie(a.cookie),
    );
    const write = await t.app.request(
      `/api/guides/${guide.id}/correction-memos`,
      jsonRequest("POST", { body: "하나 더" }, a.cookie),
    );
    const landlordView = await t.app.request(
      `/api/buildings/${building.id}/correction-memos`,
      withCookie(managerCookie),
    );
    // Then
    expect(read.status).toBe(403);
    expect(await read.json()).toEqual({ error: { code: "NOT_CONNECTED" } });
    expect(write.status).toBe(403);
    expect(await write.json()).toEqual({ error: { code: "NOT_CONNECTED" } });
    expect((await landlordView.json()).memos.map((item: { id: string }) => item.id)).toEqual([
      memo.id,
    ]);
    const [kept] = await t.db.select().from(correctionMemos).where(eq(correctionMemos.id, memo.id));
    expect(kept).toMatchObject({ status: "pending", authorUserId: a.userId });
  });

  it("is only for the owner", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id);
    // When
    const byLandlord = await post(`/api/occupancies/${a.occupancy.id}/move-out`, managerCookie);
    // Then
    expect(byLandlord.status).toBe(404);
    const [stored] = await t.db
      .select()
      .from(occupancies)
      .where(eq(occupancies.id, a.occupancy.id));
    expect(stored?.status).toBe("active");
  });
});
