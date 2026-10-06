import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { buildings } from "../../db/schema.ts";
import {
  createManagedBuilding,
  createOccupancy,
  createUser,
  jsonRequest,
  sessionCookie,
  useTestApp,
  withCookie,
} from "../../test/helpers.ts";

const t = useTestApp();

async function stored(buildingId: string) {
  const [row] = await t.db.select().from(buildings).where(eq(buildings.id, buildingId));
  if (!row) throw new Error("building missing");
  return row;
}

describe("building confirmation (LF-12·23)", () => {
  it("starts unconfirmed, records the first confirmation with a new name, and keeps it on repeat", async () => {
    // Given: a landlord right after accepting the invite
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const before = await t.app.request("/api/manage/buildings", withCookie(managerCookie));
    // When
    const first = await t.app.request(
      `/api/manage/buildings/${building.id}/confirm`,
      jsonRequest("POST", { name: "  햇빛빌라  " }, managerCookie),
    );
    const again = await t.app.request(
      `/api/manage/buildings/${building.id}/confirm`,
      jsonRequest("POST", {}, managerCookie),
    );
    const detail = await t.app.request(
      `/api/manage/buildings/${building.id}`,
      withCookie(managerCookie),
    );
    // Then
    expect((await before.json()).buildings).toEqual([
      expect.objectContaining({ id: building.id, confirmedAt: null }),
    ]);
    expect(first.status).toBe(200);
    const confirmed = await first.json();
    expect(confirmed).toEqual({
      id: building.id,
      name: "햇빛빌라",
      displayAddress: "서울 노원구 월계동 OO길",
      fullAddress: "서울 노원구 월계동 000-99",
      status: "preparing",
      openedAt: null,
      confirmedAt: expect.any(String),
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({
      name: "햇빛빌라",
      confirmedAt: confirmed.confirmedAt,
    });
    expect((await detail.json()).building).toMatchObject({
      name: "햇빛빌라",
      confirmedAt: confirmed.confirmedAt,
    });
  });

  it("renames with PATCH without touching the address, status or confirmation", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    // When: an extra address field is ignored
    const response = await t.app.request(
      `/api/manage/buildings/${building.id}`,
      jsonRequest(
        "PATCH",
        { name: "월계 빌라 2동", fullAddress: "다른 주소", displayAddress: "다른 길" },
        managerCookie,
      ),
    );
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "월계 빌라 2동",
      fullAddress: "서울 노원구 월계동 000-99",
      confirmedAt: null,
    });
    expect(await stored(building.id)).toMatchObject({
      name: "월계 빌라 2동",
      displayAddress: "서울 노원구 월계동 OO길",
      fullAddress: "서울 노원구 월계동 000-99",
      status: "preparing",
      confirmedAt: null,
    });
  });

  it("refuses another landlord, a resident of the building and anonymous requests", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db);
    const other = await createManagedBuilding(t.db);
    const residentId = await createUser(t.db);
    await createOccupancy(t.db, building.id, residentId);
    const residentCookie = await sessionCookie(t.db, residentId);
    const rename = (cookie?: string) =>
      t.app.request(
        `/api/manage/buildings/${building.id}`,
        jsonRequest("PATCH", { name: "남의 건물" }, cookie),
      );
    const confirm = (cookie?: string) =>
      t.app.request(
        `/api/manage/buildings/${building.id}/confirm`,
        jsonRequest("POST", { name: "남의 건물" }, cookie),
      );
    // When
    const responses = {
      otherRename: await rename(other.managerCookie),
      otherConfirm: await confirm(other.managerCookie),
      residentRename: await rename(residentCookie),
      residentConfirm: await confirm(residentCookie),
      anonymousRename: await rename(),
      anonymousConfirm: await confirm(),
    };
    // Then
    for (const key of [
      "otherRename",
      "otherConfirm",
      "residentRename",
      "residentConfirm",
    ] as const) {
      expect(responses[key].status).toBe(403);
      expect(await responses[key].json()).toEqual({ error: { code: "NOT_BUILDING_MANAGER" } });
    }
    expect(responses.anonymousRename.status).toBe(401);
    expect(responses.anonymousConfirm.status).toBe(401);
    expect(await stored(building.id)).toMatchObject({ name: "테스트빌라", confirmedAt: null });
  });

  it("answers 404 for an unknown building", async () => {
    // Given
    const { managerCookie } = await createManagedBuilding(t.db);
    // When
    const response = await t.app.request(
      `/api/manage/buildings/${crypto.randomUUID()}/confirm`,
      jsonRequest("POST", {}, managerCookie),
    );
    // Then
    expect(response.status).toBe(404);
  });

  it.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["41 characters", "가".repeat(41)],
    ["a line break", "햇살\n빌라"],
    ["a tab", "햇살\t빌라"],
    ["a line separator", "햇살 빌라"],
    ["a direction override", "‮라빌살햇"],
    ["no letter or digit", "​"],
    ["only a Hangul filler", "ㅤ"],
    ["only Hangul choseong·jungseong fillers", "ᅟᅠ"],
    ["a halfwidth Hangul filler and a combining mark", "ﾠ́"],
    ["zero-width spaces around a Hangul filler", "​ㅤ​"],
    ["a trailing zero-width space", "햇살빌라​"],
    ["a zero-width joiner inside", "햇살‍빌라"],
    ["a leading left-to-right mark", "‎햇살"],
    ["a leading right-to-left mark", "‏12"],
    ["an Arabic letter mark", "a؜"],
    ["a byte order mark inside", "햇살﻿빌라"],
    ["tag characters", "햇살\u{E0041}\u{E007F}"],
    ["a private use character", "햇살"],
    ["an unassigned code point", "햇살\u{2FFFE}"],
    ["a lone surrogate", "햇살\uD800"],
    ["three combining marks in a row", "á́́"],
    ["many combining marks in a row", `햇살${"̶".repeat(20)}`],
    ["not a string", 12],
  ])("rejects a name with %s", async (_label, name) => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    // When
    const patch = await t.app.request(
      `/api/manage/buildings/${building.id}`,
      jsonRequest("PATCH", { name }, managerCookie),
    );
    const confirm = await t.app.request(
      `/api/manage/buildings/${building.id}/confirm`,
      jsonRequest("POST", { name }, managerCookie),
    );
    // Then
    for (const response of [patch, confirm]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "VALIDATION_FAILED", fields: { name: expect.any(String) } },
      });
    }
    expect(await stored(building.id)).toMatchObject({ name: "테스트빌라", confirmedAt: null });
  });

  it("accepts exactly 40 characters and requires a name for PATCH", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    // When
    const longest = await t.app.request(
      `/api/manage/buildings/${building.id}`,
      jsonRequest("PATCH", { name: "가".repeat(40) }, managerCookie),
    );
    const missing = await t.app.request(
      `/api/manage/buildings/${building.id}`,
      jsonRequest("PATCH", {}, managerCookie),
    );
    // Then
    expect(longest.status).toBe(200);
    expect(missing.status).toBe(400);
    expect((await stored(building.id)).name).toBe("가".repeat(40));
  });

  it.each([
    ["Korean with a digit", "월계 빌라 2동", "월계 빌라 2동"],
    ["Latin letters", "Sunny House", "Sunny House"],
    ["decomposed Vietnamese with two marks on a letter", "Nhà Việt", null],
    ["a leading byte order mark (trimmed)", "﻿햇살빌라", "햇살빌라"],
  ])("accepts a name with %s", async (_label, name, expected) => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    // When
    const response = await t.app.request(
      `/api/manage/buildings/${building.id}`,
      jsonRequest("PATCH", { name }, managerCookie),
    );
    // Then
    expect(response.status).toBe(200);
    expect((await stored(building.id)).name).toBe(expected ?? name);
  });
});
