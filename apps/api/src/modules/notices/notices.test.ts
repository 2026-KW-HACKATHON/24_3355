import { describe, expect, it } from "vitest";
import { notices } from "../../db/schema.ts";
import { DEMO_BUILDING_ID, seedDemo } from "../../db/seed.ts";
import { createBuilding, useTestApp } from "../../test/helpers.ts";

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
      notice: { buildingId: DEMO_BUILDING_ID, title: "9월 28일(일) 오전 단수 안내" },
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
