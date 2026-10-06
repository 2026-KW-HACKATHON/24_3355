import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { occupancies, pushSubscriptions } from "../../db/schema.ts";
import {
  createBuilding,
  createOccupancy,
  createPushSubscription,
  createUser,
  jsonRequest,
  sessionCookie,
  setJoinCode,
  useTestApp,
  withCookie,
} from "../../test/helpers.ts";
import * as repo from "./repo.ts";

// 새 연결 insert를 실패시켜 건물 전환 트랜잭션이 되돌려지는지 봅니다. 기본 동작은 실제 함수입니다.
vi.mock("./repo.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repo.ts")>();
  return { ...actual, insertOccupancy: vi.fn(actual.insertOccupancy) };
});

const t = useTestApp();
const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.mocked(repo.insertOccupancy).mockClear();
});

async function resident() {
  const userId = await createUser(t.db);
  return { userId, cookie: await sessionCookie(t.db, userId) };
}

async function buildingWithCode(code = "WK72P4") {
  const building = await createBuilding(t.db, "open");
  await setJoinCode(t.db, building.id, code);
  return building;
}

function connect(buildingId: string, body: object, cookie?: string) {
  return t.app.request(
    `/api/buildings/${buildingId}/occupancies`,
    jsonRequest("POST", body, cookie),
  );
}

function liveOccupancies(userId: string) {
  return t.db
    .select()
    .from(occupancies)
    .where(eq(occupancies.userId, userId))
    .then((rows) => rows.filter((row) => row.status !== "inactive"));
}

describe("connect with a join code", () => {
  it("creates an active occupancy and shows it in /me", async () => {
    // Given
    const building = await buildingWithCode();
    const { userId, cookie } = await resident();
    // When
    const response = await connect(building.id, { code: "wk72p4" }, cookie);
    const me = await t.app.request("/api/me", withCookie(cookie));
    // Then
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      occupancy: { buildingId: building.id, status: "active" },
      alreadyConnected: false,
      endedOccupancyId: null,
    });
    // 기본 재확인 주기(RECONFIRM_INTERVAL_DAYS=365, ‘1년에 한 번’) 뒤에 요청하고, 그 뒤 14일이 답할 기한입니다.
    const next = Date.parse(body.occupancy.nextReconfirmAt);
    expect(next - Date.parse(body.occupancy.connectedAt)).toBeGreaterThan(364.9 * DAY_MS);
    expect(next - Date.parse(body.occupancy.connectedAt)).toBeLessThan(365.1 * DAY_MS);
    expect(Date.parse(body.occupancy.reconfirmDueAt) - next).toBe(14 * DAY_MS);
    expect(body.occupancy).toMatchObject({
      reconfirmRequested: false,
      lastReconfirmedAt: null,
      endedAt: null,
    });
    expect(await me.json()).toMatchObject({
      user: { id: userId },
      occupancy: { id: body.occupancy.id, buildingName: "테스트빌라", status: "active" },
    });
  });

  it("requires login and a correct code, and makes no occupancy otherwise", async () => {
    // Given
    const building = await buildingWithCode();
    const { userId, cookie } = await resident();
    // When
    const anonymous = await connect(building.id, { code: "WK72P4" });
    const wrong = await connect(building.id, { code: "AAAAAA" }, cookie);
    // Then
    expect(anonymous.status).toBe(401);
    expect(wrong.status).toBe(409);
    expect(await wrong.json()).toEqual({ error: { code: "JOIN_CODE_INVALID" } });
    expect(await liveOccupancies(userId)).toEqual([]);
  });

  it("answers 200 without changes when already connected to the same building", async () => {
    // Given
    const building = await buildingWithCode();
    const { cookie } = await resident();
    const first = await (await connect(building.id, { code: "WK72P4" }, cookie)).json();
    // When
    const again = await connect(building.id, { code: "WK72P4" }, cookie);
    // Then
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({
      occupancy: { id: first.occupancy.id },
      alreadyConnected: true,
      reconfirmed: false,
      endedOccupancyId: null,
    });
  });

  it("treats the current code entered again during a reconfirm request as ‘still living here’", async () => {
    // Given: one resident is asked to reconfirm, another is already past the 14 days
    const building = await buildingWithCode();
    const requested = await resident();
    const requestedRow = await createOccupancy(t.db, building.id, requested.userId, "active", {
      nextReconfirmAt: new Date(Date.now() - DAY_MS),
    });
    const overdue = await resident();
    await createOccupancy(t.db, building.id, overdue.userId, "active", {
      nextReconfirmAt: new Date(Date.now() - 15 * DAY_MS),
    });
    // When
    const response = await connect(building.id, { code: "WK72P4" }, requested.cookie);
    const overdueResponse = await connect(building.id, { code: "wk7 2p4" }, overdue.cookie);
    // Then
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      occupancy: { id: requestedRow.id, status: "active", reconfirmRequested: false },
      alreadyConnected: true,
      reconfirmed: true,
      endedOccupancyId: null,
    });
    expect(body.occupancy.lastReconfirmedAt).toEqual(expect.any(String));
    expect(Date.parse(body.occupancy.nextReconfirmAt) - Date.now()).toBeGreaterThan(364 * DAY_MS);
    expect(await overdueResponse.json()).toMatchObject({
      occupancy: { status: "active", reconfirmRequested: false },
      reconfirmed: true,
    });
  });

  it("asks for confirmation before moving from another building", async () => {
    // Given
    const home = await buildingWithCode();
    const next = await buildingWithCode("NX2345");
    const { userId, cookie } = await resident();
    const current = await createOccupancy(t.db, home.id, userId);
    // When
    const response = await connect(next.id, { code: "NX2345" }, cookie);
    // Then
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "ALREADY_CONNECTED" } });
    expect((await liveOccupancies(userId)).map((row) => row.id)).toEqual([current.id]);
  });

  it("ends the old occupancy and creates the new one when the move is confirmed", async () => {
    // Given
    const home = await buildingWithCode();
    const next = await buildingWithCode("NX2345");
    const { userId, cookie } = await resident();
    const current = await createOccupancy(t.db, home.id, userId);
    await createPushSubscription(t.db, userId);
    await createPushSubscription(t.db, userId);
    // When
    const response = await connect(
      next.id,
      { code: "NX2345", replaceOccupancyId: current.id },
      cookie,
    );
    // Then: the move also clears this account's push subscriptions so the web asks again
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      occupancy: { buildingId: next.id, status: "active" },
      reconfirmed: false,
      endedOccupancyId: current.id,
    });
    expect(
      await t.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
    ).toEqual([]);
    const [ended] = await t.db.select().from(occupancies).where(eq(occupancies.id, current.id));
    expect(ended).toMatchObject({ status: "inactive", endedAt: expect.any(Date) });
    expect((await liveOccupancies(userId)).map((row) => row.buildingId)).toEqual([next.id]);
  });

  it("keeps the old occupancy when creating the new one fails", async () => {
    // Given
    const home = await buildingWithCode();
    const next = await buildingWithCode("NX2345");
    const { userId, cookie } = await resident();
    const current = await createOccupancy(t.db, home.id, userId);
    const endpoint = await createPushSubscription(t.db, userId);
    vi.mocked(repo.insertOccupancy).mockRejectedValueOnce(new Error("insert failed"));
    // When
    const response = await connect(
      next.id,
      { code: "NX2345", replaceOccupancyId: current.id },
      cookie,
    );
    // Then
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR" } });
    const [kept] = await t.db.select().from(occupancies).where(eq(occupancies.id, current.id));
    expect(kept).toMatchObject({ status: "active", endedAt: null });
    expect(
      (await t.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))).map(
        (row) => row.endpoint,
      ),
    ).toEqual([endpoint]);
    expect((await liveOccupancies(userId)).map((row) => row.id)).toEqual([current.id]);
  });

  it("lets someone whose earlier occupancy ended connect again", async () => {
    // Given
    const building = await buildingWithCode();
    const { userId, cookie } = await resident();
    await createOccupancy(t.db, building.id, userId, "inactive");
    // When
    const response = await connect(building.id, { code: "WK72P4" }, cookie);
    // Then
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      alreadyConnected: false,
      endedOccupancyId: null,
    });
  });

  it("locks connecting after five wrong codes with Retry-After", async () => {
    // Given
    const building = await buildingWithCode();
    const { cookie } = await resident();
    for (let i = 0; i < 4; i++) await connect(building.id, { code: "AAAAAA" }, cookie);
    // When
    const fifth = await connect(building.id, { code: "AAAAAA" }, cookie);
    const right = await connect(building.id, { code: "WK72P4" }, cookie);
    // Then
    expect(fifth.status).toBe(429);
    expect(Number(fifth.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(right.status).toBe(429);
    expect(await right.json()).toEqual({ error: { code: "JOIN_CODE_LOCKED" } });
  });
});
