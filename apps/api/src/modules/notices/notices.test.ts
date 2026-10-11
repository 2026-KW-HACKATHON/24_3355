import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DEMO_BUILDING_ID, seedDemo } from "../../db/demo.ts";
import { notices, rateLimits } from "../../db/schema.ts";
import {
  createBuilding,
  createManagedBuilding,
  jsonRequest,
  useTestApp,
} from "../../test/helpers.ts";

const t = useTestApp();
const DAY_MS = 24 * 60 * 60 * 1000;

describe("current notice", () => {
  it("returns the seeded notice while its period has not ended", async () => {
    // Given
    await seedDemo(t.db);
    // When
    const response = await t.app.request(`/api/buildings/${DEMO_BUILDING_ID}/notices/current`);
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      notice: { buildingId: DEMO_BUILDING_ID, title: "물탱크 청소로 오전 단수 안내" },
    });
  });

  it("drops a notice once it ends and prefers the latest one still running", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const now = Date.now();
    await t.db.insert(notices).values([
      {
        buildingId: building.id,
        title: "끝난 공지",
        body: "본문",
        startsAt: new Date(now - 3 * DAY_MS),
        endsAt: new Date(now - DAY_MS),
        publishedAt: new Date(now - 3 * DAY_MS),
      },
      {
        buildingId: building.id,
        title: "먼저 올린 공지",
        body: "본문",
        startsAt: new Date(now + DAY_MS),
        endsAt: new Date(now + 2 * DAY_MS),
        publishedAt: new Date(now - 2 * DAY_MS),
      },
      {
        buildingId: building.id,
        title: "나중에 올린 공지",
        body: "본문",
        startsAt: new Date(now),
        endsAt: new Date(now + DAY_MS),
        publishedAt: new Date(now - DAY_MS),
      },
    ]);
    // When
    const response = await t.app.request(`/api/buildings/${building.id}/notices/current`);
    // Then
    expect(response.status).toBe(200);
    expect((await response.json()).notice.title).toBe("나중에 올린 공지");
  });

  it("returns null without a notice and 404 for an unknown building", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    // When
    const empty = await t.app.request(`/api/buildings/${building.id}/notices/current`);
    const unknown = await t.app.request(`/api/buildings/${crypto.randomUUID()}/notices/current`);
    // Then
    expect(await empty.json()).toEqual({ notice: null });
    expect(unknown.status).toBe(404);
  });
});

describe("public notice list and detail", () => {
  it("lists only running notices and answers 410 NOTICE_ENDED for an ended one", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const now = Date.now();
    const [ended, running] = await t.db
      .insert(notices)
      .values([
        {
          buildingId: building.id,
          title: "끝난 공지",
          body: "본문",
          startsAt: new Date(now - 3 * DAY_MS),
          endsAt: new Date(now - DAY_MS),
          publishedAt: new Date(now - 3 * DAY_MS),
        },
        {
          buildingId: building.id,
          title: "진행 중인 공지",
          body: "본문",
          startsAt: new Date(now),
          endsAt: new Date(now + DAY_MS),
        },
      ])
      .returning();
    if (!ended || !running) throw new Error("notice insert failed");
    // When
    const list = await t.app.request(`/api/buildings/${building.id}/notices`);
    const endedDetail = await t.app.request(`/api/notices/${ended.id}`);
    const runningDetail = await t.app.request(`/api/notices/${running.id}`);
    const unknown = await t.app.request(`/api/notices/${crypto.randomUUID()}`);
    // Then
    expect(list.status).toBe(200);
    expect((await list.json()).notices.map((notice: { id: string }) => notice.id)).toEqual([
      running.id,
    ]);
    expect(endedDetail.status).toBe(410);
    expect(await endedDetail.json()).toEqual({ error: { code: "NOTICE_ENDED" } });
    expect(runningDetail.status).toBe(200);
    expect(await runningDetail.json()).toMatchObject({ id: running.id, title: "진행 중인 공지" });
    expect(unknown.status).toBe(404);
  });
});

describe("notice without web push configured", () => {
  it("creates the notice and delivery rows but attempts nothing", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    // When
    const response = await t.app.request(
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
    const key = await t.app.request("/api/push-subscriptions/public-key");
    // Then
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ attemptedCount: 0 });
    expect(await key.json()).toEqual({ publicKey: null });
  });
});

describe("notice rate limit", () => {
  it("lets a landlord post 10 notices an hour, then answers 429 with Retry-After", async () => {
    // Given: 이번 시간에 이미 10번 올림
    const { building, managerId, managerCookie } = await createManagedBuilding(t.db, "open");
    await t.db
      .insert(rateLimits)
      .values({ bucket: "notice_create", subjectKey: managerId, hitCount: 10 });
    // When
    const response = await t.app.request(
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
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: { code: "RATE_LIMITED" } });
    expect(response.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(await t.db.select().from(notices).where(eq(notices.buildingId, building.id))).toEqual(
      [],
    );
  });

  it("lists at most 50 running notices, newest first", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const now = Date.now();
    await t.db.insert(notices).values(
      Array.from({ length: 51 }, (_, i) => ({
        buildingId: building.id,
        title: `공지 ${i}`,
        body: "본문",
        startsAt: new Date(now),
        endsAt: new Date(now + DAY_MS),
        publishedAt: new Date(now - (i + 1) * 1000),
      })),
    );
    // When
    const response = await t.app.request(`/api/buildings/${building.id}/notices`);
    // Then
    expect(response.status).toBe(200);
    const list = ((await response.json()) as { notices: { title: string }[] }).notices;
    expect(list).toHaveLength(50);
    expect(list[0]?.title).toBe("공지 0");
    expect(list.at(-1)?.title).toBe("공지 49");
  });
});
