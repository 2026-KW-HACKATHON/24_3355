import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  addManager,
  createGuide,
  createInvite,
  createManagedBuilding,
  createUser,
  useTestApp,
} from "../test/helpers.ts";
import { buildingManagers, buildings, guides, managerInvites } from "./schema.ts";
import { DEMO_BUILDING_ID, DEMO_PREPARING_BUILDING_ID, resetDemo, seedDemo } from "./seed.ts";

const t = useTestApp();

describe("demo reset", () => {
  it("restores 새봄하우스 to preparing with no guides and leaves other buildings untouched", async () => {
    // Given: a demo run opened 새봄하우스, and an unrelated building exists
    await seedDemo(t.db);
    const demoManagerId = await createUser(t.db);
    await addManager(t.db, DEMO_PREPARING_BUILDING_ID, demoManagerId);
    await createInvite(t.db, DEMO_PREPARING_BUILDING_ID);
    await createGuide(t.db, DEMO_PREPARING_BUILDING_ID, { status: "published" });
    await t.db
      .update(buildings)
      .set({ status: "open", openedAt: new Date() })
      .where(eq(buildings.id, DEMO_PREPARING_BUILDING_ID));
    const extraDraft = await createGuide(t.db, DEMO_BUILDING_ID, { status: "draft", position: 9 });
    const other = await createManagedBuilding(t.db, "open");
    const otherGuide = await createGuide(t.db, other.building.id, { status: "published" });

    // When
    const summary = await resetDemo(t.db);

    // Then: 새봄하우스 is back to a fresh preparing building
    const [preparing] = await t.db
      .select()
      .from(buildings)
      .where(eq(buildings.id, DEMO_PREPARING_BUILDING_ID));
    expect(preparing).toMatchObject({ name: "새봄하우스", status: "preparing", openedAt: null });
    expect(
      await t.db.select().from(guides).where(eq(guides.buildingId, DEMO_PREPARING_BUILDING_ID)),
    ).toEqual([]);
    expect(
      await t.db
        .select()
        .from(buildingManagers)
        .where(eq(buildingManagers.buildingId, DEMO_PREPARING_BUILDING_ID)),
    ).toEqual([]);
    expect(
      await t.db
        .select()
        .from(managerInvites)
        .where(eq(managerInvites.buildingId, DEMO_PREPARING_BUILDING_ID)),
    ).toEqual([]);
    expect(summary.find((building) => building.id === DEMO_PREPARING_BUILDING_ID)).toMatchObject({
      guides: 1,
      managers: 1,
      invites: 1,
    });

    // Then: 햇살빌라 has exactly its seeded published guides again
    const sunny = await t.db
      .select()
      .from(guides)
      .where(and(eq(guides.buildingId, DEMO_BUILDING_ID), eq(guides.status, "published")));
    expect(sunny).toHaveLength(4);
    expect(await t.db.select().from(guides).where(eq(guides.id, extraDraft.id))).toEqual([]);

    // Then: the unrelated building, its guide and its manager are untouched
    const [otherBuilding] = await t.db
      .select()
      .from(buildings)
      .where(eq(buildings.id, other.building.id));
    expect(otherBuilding?.status).toBe("open");
    expect(await t.db.select().from(guides).where(eq(guides.id, otherGuide.id))).toHaveLength(1);
    expect(
      await t.db
        .select()
        .from(buildingManagers)
        .where(eq(buildingManagers.buildingId, other.building.id)),
    ).toHaveLength(1);
  });
});
