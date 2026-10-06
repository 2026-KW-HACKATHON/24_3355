import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_BUILDING_ID, seedDemo } from "../../db/demo.ts";
import { buildings, guides } from "../../db/schema.ts";
import {
  createBuilding,
  createGuide,
  createManagedBuilding,
  createUser,
  jsonRequest,
  sessionCookie,
  TEST_ORIGIN,
  useTestApp,
  withCookie,
} from "../../test/helpers.ts";

const t = useTestApp();

describe("public guides", () => {
  beforeAll(async () => {
    await seedDemo(t.db);
  });

  it("lists only published guides of the seeded building in position order", async () => {
    // Given: 햇살빌라 has 4 published guides; add a draft that must stay hidden
    const draft = await createGuide(t.db, DEMO_BUILDING_ID, { status: "draft", position: 0 });
    // When
    const response = await t.app.request(`/api/buildings/${DEMO_BUILDING_ID}/guides`);
    // Then
    expect(response.status).toBe(200);
    const { guides: list } = await response.json();
    expect(list.map((guide: { category: string }) => guide.category)).toEqual([
      "recycling",
      "parcel",
      "facility",
      "common",
    ]);
    expect(list.every((guide: { status: string }) => guide.status === "published")).toBe(true);
    expect(list.some((guide: { id: string }) => guide.id === draft.id)).toBe(false);
    expect(list[0]).toMatchObject({ title: "분리수거함은 주차장 안쪽에 있어요", photos: [] });
    await t.db.delete(guides).where(eq(guides.id, draft.id));
  });

  it("returns an empty list for a preparing building and 404 for an unknown one", async () => {
    // Given
    const building = await createBuilding(t.db, "preparing");
    // When
    const preparing = await t.app.request(`/api/buildings/${building.id}/guides`);
    const unknown = await t.app.request(`/api/buildings/${crypto.randomUUID()}/guides`);
    // Then
    expect(preparing.status).toBe(200);
    expect(await preparing.json()).toEqual({ guides: [] });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: { code: "NOT_FOUND" } });
  });

  it("hides drafts from the public and from other users, but shows them to the manager", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const draft = await createGuide(t.db, building.id, { status: "draft" });
    const strangerCookie = await sessionCookie(t.db, await createUser(t.db));
    // When
    const asPublic = await t.app.request(`/api/guides/${draft.id}`);
    const asStranger = await t.app.request(`/api/guides/${draft.id}`, withCookie(strangerCookie));
    const asManager = await t.app.request(`/api/guides/${draft.id}`, withCookie(managerCookie));
    // Then
    expect(asPublic.status).toBe(404);
    expect(asStranger.status).toBe(404);
    expect(asManager.status).toBe(200);
    expect(await asManager.json()).toMatchObject({
      id: draft.id,
      status: "draft",
      publishedAt: null,
    });
  });

  it("validates the guide id", async () => {
    // When
    const response = await t.app.request("/api/guides/not-a-uuid");
    // Then
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED", fields: { guideId: expect.any(String) } },
    });
  });
});

describe("creating and editing drafts", () => {
  it("lets the manager create a draft appended after existing guides", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    await createGuide(t.db, building.id, { status: "published", position: 3 });
    // When
    const response = await t.app.request(
      `/api/buildings/${building.id}/guides`,
      jsonRequest(
        "POST",
        { category: "parcel", title: "  택배 보관 위치  ", body: "현관 선반" },
        managerCookie,
      ),
    );
    // Then
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      buildingId: building.id,
      category: "parcel",
      title: "택배 보관 위치",
      status: "draft",
      position: 4,
      publishedAt: null,
    });
  });

  it("requires login, then a manager relationship", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db);
    const strangerCookie = await sessionCookie(t.db, await createUser(t.db));
    const body = { category: "recycling", title: "제목", body: "본문" };
    // When
    const anonymous = await t.app.request(
      `/api/buildings/${building.id}/guides`,
      jsonRequest("POST", body),
    );
    const stranger = await t.app.request(
      `/api/buildings/${building.id}/guides`,
      jsonRequest("POST", body, strangerCookie),
    );
    // Then
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
    expect(stranger.status).toBe(403);
    expect(await stranger.json()).toEqual({ error: { code: "NOT_BUILDING_MANAGER" } });
  });

  it("rejects invalid input with field reasons", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    // When
    const response = await t.app.request(
      `/api/buildings/${building.id}/guides`,
      jsonRequest("POST", { category: "weather", title: "   ", body: "본문" }, managerCookie),
    );
    // Then
    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(error.fields).sort()).toEqual(["category", "title"]);
  });

  it("edits a draft for the manager and refuses strangers", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const draft = await createGuide(t.db, building.id, { status: "draft" });
    const strangerCookie = await sessionCookie(t.db, await createUser(t.db));
    // When
    const edited = await t.app.request(
      `/api/guides/${draft.id}`,
      jsonRequest("PATCH", { title: "고친 제목" }, managerCookie),
    );
    const byStranger = await t.app.request(
      `/api/guides/${draft.id}`,
      jsonRequest("PATCH", { title: "남이 고친 제목" }, strangerCookie),
    );
    const empty = await t.app.request(
      `/api/guides/${draft.id}`,
      jsonRequest("PATCH", {}, managerCookie),
    );
    // Then
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({
      title: "고친 제목",
      body: "본문",
      status: "draft",
      revision: null,
    });
    expect(byStranger.status).toBe(403);
    expect(empty.status).toBe(400);
    const [stored] = await t.db.select().from(guides).where(eq(guides.id, draft.id));
    expect(stored?.title).toBe("고친 제목");
  });
});

describe("publishing", () => {
  it("publishes the first guide and opens the preparing building in one step", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "preparing");
    const draft = await createGuide(t.db, building.id, { status: "draft" });
    // When
    const response = await t.app.request(
      `/api/guides/${draft.id}/publish`,
      withCookie(managerCookie, { method: "POST" }),
    );
    // Then
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.buildingOpened).toBe(true);
    expect(result.guide).toMatchObject({ id: draft.id, status: "published" });
    expect(result.guide.publishedAt).toEqual(expect.any(String));
    const [stored] = await t.db.select().from(buildings).where(eq(buildings.id, building.id));
    expect(stored).toMatchObject({ status: "open", openedAt: expect.any(Date) });
    const publicList = await t.app.request(`/api/buildings/${building.id}/guides`);
    expect((await publicList.json()).guides).toHaveLength(1);
  });

  it("keeps the building open without reopening it on later publishes", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const draft = await createGuide(t.db, building.id, { status: "draft" });
    // When
    const response = await t.app.request(
      `/api/guides/${draft.id}/publish`,
      withCookie(managerCookie, { method: "POST" }),
    );
    // Then
    expect(response.status).toBe(200);
    expect((await response.json()).buildingOpened).toBe(false);
  });

  it("answers 409 when the guide was already published and has no saved revision", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const published = await createGuide(t.db, building.id, { status: "published" });
    // When
    const response = await t.app.request(
      `/api/guides/${published.id}/publish`,
      withCookie(managerCookie, { method: "POST" }),
    );
    // Then
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "CONFLICT" } });
  });

  it("refuses non-managers and leaves the guide and building untouched", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "preparing");
    const draft = await createGuide(t.db, building.id, { status: "draft" });
    const strangerCookie = await sessionCookie(t.db, await createUser(t.db));
    // When
    const anonymous = await t.app.request(`/api/guides/${draft.id}/publish`, {
      method: "POST",
      headers: { Origin: TEST_ORIGIN },
    });
    const stranger = await t.app.request(
      `/api/guides/${draft.id}/publish`,
      withCookie(strangerCookie, { method: "POST" }),
    );
    // Then
    expect(anonymous.status).toBe(401);
    expect(stranger.status).toBe(403);
    expect(await stranger.json()).toEqual({ error: { code: "NOT_BUILDING_MANAGER" } });
    const [storedGuide] = await t.db.select().from(guides).where(eq(guides.id, draft.id));
    const [storedBuilding] = await t.db
      .select()
      .from(buildings)
      .where(eq(buildings.id, building.id));
    expect(storedGuide?.status).toBe("draft");
    expect(storedBuilding?.status).toBe("preparing");
  });

  it("answers 404 for an unknown guide", async () => {
    // Given
    const { managerCookie } = await createManagedBuilding(t.db, "open");
    // When
    const response = await t.app.request(
      `/api/guides/${crypto.randomUUID()}/publish`,
      withCookie(managerCookie, { method: "POST" }),
    );
    // Then
    expect(response.status).toBe(404);
  });
});
