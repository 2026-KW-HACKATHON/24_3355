import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { correctionMemos } from "../../db/schema.ts";
import {
  addManager,
  createBuilding,
  createGuide,
  createManagedBuilding,
  createMemo,
  createOccupancy,
  createUser,
  jsonRequest,
  sessionCookie,
  useTestApp,
  withCookie,
} from "../../test/helpers.ts";

const t = useTestApp();
const DAY_MS = 24 * 60 * 60 * 1000;

async function resident(
  buildingId: string,
  status: "active" | "reconfirm_needed" | "inactive" = "active",
  nextReconfirmAt?: Date,
) {
  const userId = await createUser(t.db);
  await createOccupancy(
    t.db,
    buildingId,
    userId,
    status,
    nextReconfirmAt ? { nextReconfirmAt } : {},
  );
  return { userId, cookie: await sessionCookie(t.db, userId) };
}

/** 공개된 안내가 하나 있는 건물과 그 집주인. */
async function publishedGuide() {
  const managed = await createManagedBuilding(t.db, "open");
  const guide = await createGuide(t.db, managed.building.id, { status: "published" });
  return { ...managed, guide };
}

function writeMemo(guideId: string, body: unknown, cookie?: string) {
  return t.app.request(
    `/api/guides/${guideId}/correction-memos`,
    jsonRequest("POST", body, cookie),
  );
}

describe("POST /guides/:guideId/correction-memos", () => {
  it("lets an active resident leave a pending memo without exposing the author", async () => {
    // Given
    const { building, guide } = await publishedGuide();
    const a = await resident(building.id);
    // When
    const response = await writeMemo(
      guide.id,
      { body: "  재활용이 월·목으로 바뀌었어요  " },
      a.cookie,
    );
    // Then
    expect(response.status).toBe(201);
    const memo = await response.json();
    expect(memo).toMatchObject({
      guideId: guide.id,
      body: "재활용이 월·목으로 바뀌었어요",
      status: "pending",
      keptReason: null,
      resolvedAt: null,
      mine: true,
    });
    expect(Object.keys(memo).sort()).toEqual(
      ["body", "createdAt", "guideId", "id", "keptReason", "mine", "resolvedAt", "status"].sort(),
    );
    const [stored] = await t.db
      .select()
      .from(correctionMemos)
      .where(eq(correctionMemos.id, memo.id));
    expect(stored?.authorUserId).toBe(a.userId);
  });

  it("validates the memo length", async () => {
    // Given
    const { building, guide } = await publishedGuide();
    const a = await resident(building.id);
    // When
    const blank = await writeMemo(guide.id, { body: "   " }, a.cookie);
    const long = await writeMemo(guide.id, { body: "가".repeat(201) }, a.cookie);
    const control = await writeMemo(guide.id, { body: "수거일\u001b[2J" }, a.cookie);
    const longest = await writeMemo(guide.id, { body: "가".repeat(200) }, a.cookie);
    // Then
    expect(control.status).toBe(400);
    expect(blank.status).toBe(400);
    expect(await blank.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED", fields: { body: expect.any(String) } },
    });
    expect(long.status).toBe(400);
    expect(longest.status).toBe(201);
  });

  it("refuses everyone but active residents of this building", async () => {
    // Given
    const { building, guide, managerCookie } = await publishedGuide();
    const stranger = await sessionCookie(t.db, await createUser(t.db));
    const neighbour = await resident((await createBuilding(t.db, "open")).id);
    const moved = await resident(building.id, "inactive");
    const paused = await resident(building.id, "reconfirm_needed");
    const overdue = await resident(building.id, "active", new Date(Date.now() - 15 * DAY_MS));
    const requested = await resident(building.id, "active", new Date(Date.now() - DAY_MS));
    const body = { body: "내용이 달라요" };
    // When
    const results = {
      anonymous: await writeMemo(guide.id, body),
      stranger: await writeMemo(guide.id, body, stranger),
      neighbour: await writeMemo(guide.id, body, neighbour.cookie),
      moved: await writeMemo(guide.id, body, moved.cookie),
      paused: await writeMemo(guide.id, body, paused.cookie),
      overdue: await writeMemo(guide.id, body, overdue.cookie),
      landlord: await writeMemo(guide.id, body, managerCookie),
      requested: await writeMemo(guide.id, body, requested.cookie),
    };
    // Then
    const codes = Object.fromEntries(
      await Promise.all(
        Object.entries(results).map(async ([who, response]) => [
          who,
          response.status === 201
            ? 201
            : `${response.status} ${(await response.json()).error.code}`,
        ]),
      ),
    );
    expect(codes).toEqual({
      anonymous: "401 UNAUTHENTICATED",
      stranger: "403 NOT_CONNECTED",
      neighbour: "403 NOT_CONNECTED",
      moved: "403 NOT_CONNECTED",
      paused: "403 RECONFIRM_NEEDED",
      overdue: "403 RECONFIRM_NEEDED",
      landlord: "403 FORBIDDEN",
      // 재확인 요청 중이어도 14일 동안은 그대로 쓸 수 있습니다.
      requested: 201,
    });
    const stored = await t.db
      .select()
      .from(correctionMemos)
      .where(eq(correctionMemos.guideId, guide.id));
    expect(stored).toHaveLength(1);
  });

  it("refuses a second memo on the same guide from the same person within a minute", async () => {
    // Given
    const { building, guide } = await publishedGuide();
    const second = await createGuide(t.db, building.id, { status: "published", position: 2 });
    const a = await resident(building.id);
    const b = await resident(building.id);
    await writeMemo(guide.id, { body: "첫 메모" }, a.cookie);
    // When
    const again = await writeMemo(guide.id, { body: "바로 또 남긴 메모" }, a.cookie);
    const otherGuide = await writeMemo(second.id, { body: "다른 안내" }, a.cookie);
    const otherPerson = await writeMemo(guide.id, { body: "다른 사람" }, b.cookie);
    await t.db
      .update(correctionMemos)
      .set({ createdAt: new Date(Date.now() - 61 * 1000) })
      .where(eq(correctionMemos.guideId, guide.id));
    const later = await writeMemo(guide.id, { body: "1분 뒤" }, a.cookie);
    // Then
    expect(again.status).toBe(429);
    expect(await again.json()).toEqual({ error: { code: "RATE_LIMITED" } });
    expect(Number(again.headers.get("Retry-After"))).toBeGreaterThan(50);
    expect(Number(again.headers.get("Retry-After"))).toBeLessThanOrEqual(60);
    expect(otherGuide.status).toBe(201);
    expect(otherPerson.status).toBe(201);
    expect(later.status).toBe(201);
  });

  it("counts two simultaneous memos from one person once", async () => {
    // Given
    const { building, guide } = await publishedGuide();
    const a = await resident(building.id);
    // When
    const responses = await Promise.all([
      writeMemo(guide.id, { body: "동시에 1" }, a.cookie),
      writeMemo(guide.id, { body: "동시에 2" }, a.cookie),
    ]);
    // Then
    expect(responses.map((response) => response.status).sort()).toEqual([201, 429]);
  });

  it("answers 404 for drafts and unknown guides", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const draft = await createGuide(t.db, building.id, { status: "draft" });
    const a = await resident(building.id);
    // When
    const onDraft = await writeMemo(draft.id, { body: "초안에 메모" }, a.cookie);
    const unknown = await writeMemo(crypto.randomUUID(), { body: "없는 안내" }, a.cookie);
    // Then
    expect(onDraft.status).toBe(404);
    expect(unknown.status).toBe(404);
  });
});

describe("GET /guides/:guideId/correction-memos", () => {
  it("shows residents every memo on the guide, marking only their own as mine", async () => {
    // Given: A and B left memos; B's is newer
    const { building, guide } = await publishedGuide();
    const a = await resident(building.id);
    const b = await resident(building.id);
    const mineMemo = await createMemo(t.db, guide.id, a.userId, {
      createdAt: new Date(Date.now() - DAY_MS),
    });
    const otherMemo = await createMemo(t.db, guide.id, b.userId, { status: "kept" });
    // When
    const response = await t.app.request(
      `/api/guides/${guide.id}/correction-memos`,
      withCookie(a.cookie),
    );
    // Then
    expect(response.status).toBe(200);
    const { memos } = await response.json();
    expect(memos).toEqual([
      expect.objectContaining({
        id: otherMemo.id,
        mine: false,
        status: "kept",
        keptReason: "지금 안내가 맞아요",
      }),
      expect.objectContaining({ id: mineMemo.id, mine: true, status: "pending" }),
    ]);
    expect(JSON.stringify(memos)).not.toContain(a.userId);
    expect(JSON.stringify(memos)).not.toContain(b.userId);
  });

  it("lets reconfirm_needed residents and the landlord read, but not others", async () => {
    // Given
    const { building, guide, managerCookie } = await publishedGuide();
    await createMemo(t.db, guide.id, null);
    const paused = await resident(building.id, "active", new Date(Date.now() - 15 * DAY_MS));
    const moved = await resident(building.id, "inactive");
    const neighbour = await resident((await createBuilding(t.db, "open")).id);
    const read = (cookie?: string) =>
      t.app.request(`/api/guides/${guide.id}/correction-memos`, cookie ? withCookie(cookie) : {});
    // When
    const asPaused = await read(paused.cookie);
    const asLandlord = await read(managerCookie);
    const asMoved = await read(moved.cookie);
    const asNeighbour = await read(neighbour.cookie);
    const asPublic = await read();
    // Then
    expect(asPaused.status).toBe(200);
    expect(asLandlord.status).toBe(200);
    expect((await asLandlord.json()).memos).toEqual([expect.objectContaining({ mine: false })]);
    expect(asMoved.status).toBe(403);
    expect(asNeighbour.status).toBe(403);
    expect(asPublic.status).toBe(401);
  });
});

describe("memo list size", () => {
  it("returns at most the 100 newest memos under a guide", async () => {
    // Given
    const { building, guide } = await publishedGuide();
    const a = await resident(building.id);
    await t.db.insert(correctionMemos).values(
      Array.from({ length: 101 }, (_, i) => ({
        guideId: guide.id,
        body: `메모 ${i}`,
        createdAt: new Date(Date.now() - (101 - i) * 1000),
      })),
    );
    // When
    const response = await t.app.request(
      `/api/guides/${guide.id}/correction-memos`,
      withCookie(a.cookie),
    );
    // Then
    const { memos } = await response.json();
    expect(memos).toHaveLength(100);
    expect(memos[0].body).toBe("메모 100");
    expect(memos.at(-1).body).toBe("메모 1");
  });
});

describe("landlord memo list and keep", () => {
  it("lists pending memos first with the guide title, and filters by status", async () => {
    // Given
    const { building, guide, managerCookie } = await publishedGuide();
    const second = await createGuide(t.db, building.id, {
      status: "published",
      category: "parcel",
      position: 2,
    });
    const a = await resident(building.id);
    const oldPending = await createMemo(t.db, guide.id, a.userId, {
      createdAt: new Date(Date.now() - 2 * DAY_MS),
    });
    const applied = await createMemo(t.db, guide.id, a.userId, { status: "applied" });
    const newPending = await createMemo(t.db, second.id, null);
    const list = async (query = "") => {
      const response = await t.app.request(
        `/api/buildings/${building.id}/correction-memos${query}`,
        withCookie(managerCookie),
      );
      return response.json();
    };
    // When
    const all = await list();
    const pending = await list("?status=pending");
    // Then
    expect(all.memos.map((memo: { id: string }) => memo.id)).toEqual([
      newPending.id,
      oldPending.id,
      applied.id,
    ]);
    expect(all.memos[0]).toMatchObject({ guideTitle: "published 안내", guideCategory: "parcel" });
    expect(JSON.stringify(all)).not.toContain(a.userId);
    expect(pending.memos.map((memo: { id: string }) => memo.id)).toEqual([
      newPending.id,
      oldPending.id,
    ]);
  });

  it("keeps a memo with a required reason and refuses to decide it twice", async () => {
    // Given
    const { building, guide, managerCookie } = await publishedGuide();
    const a = await resident(building.id);
    const memo = await createMemo(t.db, guide.id, a.userId);
    const keep = (body: unknown, cookie = managerCookie) =>
      t.app.request(`/api/correction-memos/${memo.id}/keep`, jsonRequest("POST", body, cookie));
    // When
    const noReason = await keep({});
    const blankReason = await keep({ reason: "  " });
    const twoLines = await keep({ reason: "수거 요일은\n그대로예요" });
    const withTab = await keep({ reason: "수거 요일은\t그대로예요" });
    const withEscape = await keep({ reason: "그대로예요\u001b[2J" });
    const tooLong = await keep({ reason: "가".repeat(201) });
    const kept = await keep({ reason: "  수거 요일은 그대로예요 " });
    const twice = await keep({ reason: "다시" });
    const residentView = await t.app.request(
      `/api/guides/${guide.id}/correction-memos`,
      withCookie(a.cookie),
    );
    // Then
    expect(noReason.status).toBe(400);
    expect(blankReason.status).toBe(400);
    for (const response of [twoLines, withTab, withEscape, tooLong]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "VALIDATION_FAILED", fields: { reason: expect.any(String) } },
      });
    }
    expect(kept.status).toBe(200);
    const result = await kept.json();
    expect(result).toMatchObject({
      id: memo.id,
      status: "kept",
      keptReason: "수거 요일은 그대로예요",
      guideTitle: "published 안내",
    });
    expect(result.resolvedAt).toEqual(expect.any(String));
    expect(twice.status).toBe(409);
    expect(await twice.json()).toEqual({ error: { code: "CONFLICT" } });
    expect((await residentView.json()).memos).toEqual([
      expect.objectContaining({
        id: memo.id,
        mine: true,
        status: "kept",
        keptReason: "수거 요일은 그대로예요",
      }),
    ]);
  });

  it("refuses residents and other buildings' landlords", async () => {
    // Given
    const { building, guide } = await publishedGuide();
    const other = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id);
    const memo = await createMemo(t.db, guide.id, a.userId);
    // When
    const listByOther = await t.app.request(
      `/api/buildings/${building.id}/correction-memos`,
      withCookie(other.managerCookie),
    );
    const listByResident = await t.app.request(
      `/api/buildings/${building.id}/correction-memos`,
      withCookie(a.cookie),
    );
    const getByOther = await t.app.request(
      `/api/correction-memos/${memo.id}`,
      withCookie(other.managerCookie),
    );
    const keepByOther = await t.app.request(
      `/api/correction-memos/${memo.id}/keep`,
      jsonRequest("POST", { reason: "남의 건물" }, other.managerCookie),
    );
    const keepByResident = await t.app.request(
      `/api/correction-memos/${memo.id}/keep`,
      jsonRequest("POST", { reason: "내가 유지" }, a.cookie),
    );
    const getUnknown = await t.app.request(
      `/api/correction-memos/${crypto.randomUUID()}`,
      withCookie(other.managerCookie),
    );
    // Then
    for (const response of [listByOther, listByResident, getByOther, keepByOther, keepByResident]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: { code: "NOT_BUILDING_MANAGER" } });
    }
    expect(getUnknown.status).toBe(404);
    const [stored] = await t.db
      .select()
      .from(correctionMemos)
      .where(eq(correctionMemos.id, memo.id));
    expect(stored?.status).toBe("pending");
  });

  it("shows one memo to its landlord and counts pending memos per managed building", async () => {
    // Given
    const { building, guide, managerCookie, managerId } = await publishedGuide();
    const memo = await createMemo(t.db, guide.id, null);
    await createMemo(t.db, guide.id, null);
    await createMemo(t.db, guide.id, null, { status: "kept" });
    const empty = await createBuilding(t.db, "open");
    await addManager(t.db, empty.id, managerId);
    // When
    const one = await t.app.request(`/api/correction-memos/${memo.id}`, withCookie(managerCookie));
    const summary = await t.app.request("/api/manage/buildings", withCookie(managerCookie));
    // Then
    expect(one.status).toBe(200);
    expect(await one.json()).toMatchObject({ id: memo.id, status: "pending", guideId: guide.id });
    const { buildings } = await summary.json();
    expect(
      Object.fromEntries(
        buildings.map((item: { id: string; pendingMemoCount: number }) => [
          item.id,
          item.pendingMemoCount,
        ]),
      ),
    ).toEqual({ [building.id]: 2, [empty.id]: 0 });
  });
});
