import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { buildingManagers, managerInvites } from "../../db/schema.ts";
import {
  createBuilding,
  createGuide,
  createInvite,
  createManagedBuilding,
  createUser,
  jsonRequest,
  sessionCookie,
  useTestApp,
  withCookie,
} from "../../test/helpers.ts";

const t = useTestApp();

describe("public building", () => {
  it("returns an open building without the team-verified full address", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    // When
    const response = await t.app.request(`/api/buildings/${building.id}`);
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: building.id,
      name: "테스트빌라",
      displayAddress: "서울 노원구 월계동 OO길",
      status: "open",
    });
  });

  it("returns a preparing building so the web can show the empty guide state", async () => {
    // Given
    const building = await createBuilding(t.db, "preparing");
    // When
    const response = await t.app.request(`/api/buildings/${building.id}`);
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "preparing" });
  });

  it("answers 404 for an unknown id and 400 for a malformed one", async () => {
    // When
    const unknown = await t.app.request(`/api/buildings/${crypto.randomUUID()}`);
    const malformed = await t.app.request("/api/buildings/12345");
    // Then
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: { code: "NOT_FOUND" } });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED", fields: { buildingId: expect.any(String) } },
    });
  });
});

describe("manager invites", () => {
  it("previews the building name without login", async () => {
    // Given
    const building = await createBuilding(t.db);
    const token = await createInvite(t.db, building.id);
    // When
    const response = await t.app.request(
      "/api/manager-invites/preview",
      jsonRequest("POST", { token }),
    );
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ buildingName: "테스트빌라" });
  });

  it("accepts an invite once and makes the user a manager", async () => {
    // Given
    const building = await createBuilding(t.db);
    const token = await createInvite(t.db, building.id);
    const userId = await createUser(t.db);
    const cookie = await sessionCookie(t.db, userId);
    // When
    const first = await t.app.request(
      "/api/manager-invites/accept",
      jsonRequest("POST", { token }, cookie),
    );
    const again = await t.app.request(
      "/api/manager-invites/accept",
      jsonRequest("POST", { token }, cookie),
    );
    // Then
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ buildingId: building.id, alreadyManager: false });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ buildingId: building.id, alreadyManager: true });
    const managers = await t.db
      .select()
      .from(buildingManagers)
      .where(
        and(eq(buildingManagers.buildingId, building.id), eq(buildingManagers.userId, userId)),
      );
    expect(managers).toHaveLength(1);
    const [invite] = await t.db
      .select()
      .from(managerInvites)
      .where(eq(managerInvites.buildingId, building.id));
    expect(invite).toMatchObject({ status: "accepted", acceptedByUserId: userId });
  });

  it("does not let a second account reuse an accepted invite", async () => {
    // Given
    const building = await createBuilding(t.db);
    const token = await createInvite(t.db, building.id);
    const firstCookie = await sessionCookie(t.db, await createUser(t.db));
    const secondCookie = await sessionCookie(t.db, await createUser(t.db));
    await t.app.request("/api/manager-invites/accept", jsonRequest("POST", { token }, firstCookie));
    // When
    const response = await t.app.request(
      "/api/manager-invites/accept",
      jsonRequest("POST", { token }, secondCookie),
    );
    const preview = await t.app.request(
      "/api/manager-invites/preview",
      jsonRequest("POST", { token }),
    );
    // Then
    expect(response.status).toBe(404);
    expect(preview.status).toBe(404);
  });

  it("answers 410 for an expired invite and 404 for an unknown token", async () => {
    // Given
    const building = await createBuilding(t.db);
    const expired = await createInvite(t.db, building.id, { expiresInMs: -1000 });
    const cookie = await sessionCookie(t.db, await createUser(t.db));
    // When
    const accept = await t.app.request(
      "/api/manager-invites/accept",
      jsonRequest("POST", { token: expired }, cookie),
    );
    const preview = await t.app.request(
      "/api/manager-invites/preview",
      jsonRequest("POST", { token: expired }),
    );
    const unknown = await t.app.request(
      "/api/manager-invites/accept",
      jsonRequest("POST", { token: "x".repeat(43) }, cookie),
    );
    // Then
    expect(accept.status).toBe(410);
    expect(await accept.json()).toEqual({ error: { code: "INVITE_EXPIRED" } });
    expect(preview.status).toBe(410);
    expect(unknown.status).toBe(404);
  });

  it("requires login to accept", async () => {
    // Given
    const building = await createBuilding(t.db);
    const token = await createInvite(t.db, building.id);
    // When
    const response = await t.app.request(
      "/api/manager-invites/accept",
      jsonRequest("POST", { token }),
    );
    // Then
    expect(response.status).toBe(401);
  });
});

describe("manage views", () => {
  it("lists managed buildings with guide counts", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    await createGuide(t.db, building.id, { status: "published" });
    await createGuide(t.db, building.id, { status: "draft", position: 2 });
    await createGuide(t.db, building.id, { status: "draft", position: 3 });
    await createBuilding(t.db, "open");
    // When
    const response = await t.app.request("/api/manage/buildings", withCookie(managerCookie));
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      buildings: [
        expect.objectContaining({
          id: building.id,
          fullAddress: "서울 노원구 월계동 000-99",
          publishedGuideCount: 1,
          draftGuideCount: 2,
        }),
      ],
    });
  });

  it("shows drafts to the manager and refuses other accounts", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const draft = await createGuide(t.db, building.id, { status: "draft" });
    const strangerCookie = await sessionCookie(t.db, await createUser(t.db));
    // When
    const asManager = await t.app.request(
      `/api/manage/buildings/${building.id}`,
      withCookie(managerCookie),
    );
    const asStranger = await t.app.request(
      `/api/manage/buildings/${building.id}`,
      withCookie(strangerCookie),
    );
    const anonymous = await t.app.request("/api/manage/buildings");
    // Then
    expect(asManager.status).toBe(200);
    expect(await asManager.json()).toMatchObject({
      building: { id: building.id, status: "preparing", openedAt: null },
      guides: [{ id: draft.id, status: "draft" }],
    });
    expect(asStranger.status).toBe(403);
    expect(await asStranger.json()).toEqual({ error: { code: "NOT_BUILDING_MANAGER" } });
    expect(anonymous.status).toBe(401);
  });
});
