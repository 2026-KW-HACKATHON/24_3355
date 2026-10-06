import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { correctionMemos, guideRevisions, guides } from "../../db/schema.ts";
import {
  createGuide,
  createManagedBuilding,
  createMemo,
  createOccupancy,
  createUser,
  jsonRequest,
  sessionCookie,
  TEST_ORIGIN,
  useTestApp,
  withCookie,
} from "../../test/helpers.ts";
import * as repo from "./repo.ts";

// 메모 반영을 실패시켜 수정 공개 트랜잭션이 되돌려지는지 봅니다. 기본 동작은 실제 함수입니다.
vi.mock("./repo.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repo.ts")>();
  return { ...actual, applyMemos: vi.fn(actual.applyMemos) };
});

const t = useTestApp();

afterEach(() => {
  vi.mocked(repo.applyMemos).mockClear();
});

/** 공개된 안내, 그 집주인, 메모를 남긴 거주자. */
async function publishedWithMemos(memoCount = 2) {
  const managed = await createManagedBuilding(t.db, "open");
  const guide = await createGuide(t.db, managed.building.id, { status: "published" });
  const residentId = await createUser(t.db);
  await createOccupancy(t.db, managed.building.id, residentId);
  const memos = [];
  for (let i = 0; i < memoCount; i++) memos.push(await createMemo(t.db, guide.id, residentId));
  return { ...managed, guide, memos, residentCookie: await sessionCookie(t.db, residentId) };
}

function patch(guideId: string, body: unknown, cookie: string) {
  return t.app.request(`/api/guides/${guideId}`, jsonRequest("PATCH", body, cookie));
}

function publish(guideId: string, cookie: string, applyMemoIds?: string[]) {
  return t.app.request(
    `/api/guides/${guideId}/publish`,
    applyMemoIds
      ? jsonRequest("POST", { applyMemoIds }, cookie)
      : withCookie(cookie, { method: "POST" }),
  );
}

async function storedGuide(guideId: string) {
  const [row] = await t.db.select().from(guides).where(eq(guides.id, guideId));
  return row;
}

async function memoStatuses(guideId: string) {
  const rows = await t.db
    .select({ id: correctionMemos.id, status: correctionMemos.status })
    .from(correctionMemos)
    .where(eq(correctionMemos.guideId, guideId));
  return Object.fromEntries(rows.map((row) => [row.id, row.status]));
}

describe("editing a published guide", () => {
  it("saves a revision and leaves the published content untouched", async () => {
    // Given
    const { guide, managerCookie } = await publishedWithMemos(0);
    // When
    const first = await patch(guide.id, { title: "재활용은 월·목" }, managerCookie);
    const second = await patch(
      guide.id,
      { body: "재활용은 월·목 저녁에 내놓아 주세요" },
      managerCookie,
    );
    const publicView = await t.app.request(`/api/guides/${guide.id}`);
    const revision = await t.app.request(
      `/api/guides/${guide.id}/revision`,
      withCookie(managerCookie),
    );
    // Then: the response keeps the published fields and carries the merged revision
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      title: "published 안내",
      body: "본문",
      status: "published",
      revision: { guideId: guide.id, category: "recycling", title: "재활용은 월·목", body: "본문" },
    });
    expect((await second.json()).revision).toMatchObject({
      title: "재활용은 월·목",
      body: "재활용은 월·목 저녁에 내놓아 주세요",
    });
    expect(await publicView.json()).toMatchObject({ title: "published 안내", body: "본문" });
    expect(await revision.json()).toEqual({
      revision: {
        guideId: guide.id,
        category: "recycling",
        title: "재활용은 월·목",
        body: "재활용은 월·목 저녁에 내놓아 주세요",
        savedAt: expect.any(String),
      },
    });
    const stored = await storedGuide(guide.id);
    expect(stored?.updatedAt.toISOString()).toBe(guide.updatedAt.toISOString());
  });

  it("keeps both edits when two saves of different fields arrive at once", async () => {
    // Given
    const { guide, managerCookie } = await publishedWithMemos(0);
    await patch(guide.id, { category: "parcel" }, managerCookie);
    // When
    const [title, body] = await Promise.all([
      patch(guide.id, { title: "동시에 고친 제목" }, managerCookie),
      patch(guide.id, { body: "동시에 고친 본문" }, managerCookie),
    ]);
    // Then
    expect(title.status).toBe(200);
    expect(body.status).toBe(200);
    const [revision] = await t.db
      .select()
      .from(guideRevisions)
      .where(eq(guideRevisions.guideId, guide.id));
    expect(revision).toMatchObject({
      category: "parcel",
      title: "동시에 고친 제목",
      body: "동시에 고친 본문",
    });
  });

  it("discards a revision on cancel, keeping content and memos as they were", async () => {
    // Given
    const { guide, memos, managerCookie } = await publishedWithMemos(1);
    await patch(guide.id, { title: "취소할 수정" }, managerCookie);
    // When
    const discarded = await t.app.request(
      `/api/guides/${guide.id}/revision`,
      withCookie(managerCookie, { method: "DELETE" }),
    );
    const again = await t.app.request(
      `/api/guides/${guide.id}/revision`,
      withCookie(managerCookie, { method: "DELETE" }),
    );
    const revision = await t.app.request(
      `/api/guides/${guide.id}/revision`,
      withCookie(managerCookie),
    );
    const nothingToPublish = await publish(guide.id, managerCookie);
    // Then
    expect(discarded.status).toBe(204);
    expect(again.status).toBe(204);
    expect(await revision.json()).toEqual({ revision: null });
    expect(nothingToPublish.status).toBe(409);
    expect((await storedGuide(guide.id))?.title).toBe("published 안내");
    expect(await memoStatuses(guide.id)).toEqual({ [memos[0]?.id as string]: "pending" });
  });

  it("keeps revisions to the landlord", async () => {
    // Given
    const { guide, managerCookie, residentCookie } = await publishedWithMemos(0);
    const other = await createManagedBuilding(t.db, "open");
    await patch(guide.id, { title: "집주인만 보는 수정" }, managerCookie);
    // When
    const byResident = await patch(guide.id, { title: "거주자 수정" }, residentCookie);
    const readByResident = await t.app.request(
      `/api/guides/${guide.id}/revision`,
      withCookie(residentCookie),
    );
    const readByOther = await t.app.request(
      `/api/guides/${guide.id}/revision`,
      withCookie(other.managerCookie),
    );
    const discardByOther = await t.app.request(
      `/api/guides/${guide.id}/revision`,
      withCookie(other.managerCookie, { method: "DELETE" }),
    );
    const anonymous = await t.app.request(`/api/guides/${guide.id}/revision`, {
      headers: { Origin: TEST_ORIGIN },
    });
    // Then
    expect(byResident.status).toBe(403);
    expect(readByResident.status).toBe(403);
    expect(readByOther.status).toBe(403);
    expect(discardByOther.status).toBe(403);
    expect(anonymous.status).toBe(401);
    const [stored] = await t.db
      .select()
      .from(guideRevisions)
      .where(eq(guideRevisions.guideId, guide.id));
    expect(stored?.title).toBe("집주인만 보는 수정");
  });
});

describe("publishing a revision (수정 공개)", () => {
  it("swaps in the revision and applies the chosen memos in one step", async () => {
    // Given: two pending memos; the landlord applies only the first
    const { guide, memos, managerCookie } = await publishedWithMemos(2);
    const [applied, untouched] = memos.map((memo) => memo.id) as [string, string];
    await patch(guide.id, { title: "재활용은 월·목", category: "recycling" }, managerCookie);
    // When
    const response = await publish(guide.id, managerCookie, [applied, applied]);
    // Then
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      guide: { id: guide.id, title: "재활용은 월·목", status: "published" },
      buildingOpened: false,
      appliedMemoIds: [applied],
    });
    expect(Date.parse(result.guide.updatedAt)).toBeGreaterThan(guide.updatedAt.getTime());
    expect(result.guide.publishedAt).toBe(guide.publishedAt?.toISOString());
    expect((await (await t.app.request(`/api/guides/${guide.id}`)).json()).title).toBe(
      "재활용은 월·목",
    );
    expect(await memoStatuses(guide.id)).toEqual({ [applied]: "applied", [untouched]: "pending" });
    const [memo] = await t.db.select().from(correctionMemos).where(eq(correctionMemos.id, applied));
    expect(memo?.resolvedAt).toEqual(expect.any(Date));
    expect(
      await t.db.select().from(guideRevisions).where(eq(guideRevisions.guideId, guide.id)),
    ).toEqual([]);
  });

  it("refuses to apply the same memo twice", async () => {
    // Given: the memo was applied by an earlier 수정 공개
    const { guide, memos, managerCookie } = await publishedWithMemos(1);
    const memoId = memos[0]?.id as string;
    await patch(guide.id, { title: "첫 수정" }, managerCookie);
    await publish(guide.id, managerCookie, [memoId]);
    await patch(guide.id, { title: "두 번째 수정" }, managerCookie);
    // When
    const again = await publish(guide.id, managerCookie, [memoId]);
    const keepApplied = await t.app.request(
      `/api/correction-memos/${memoId}/keep`,
      jsonRequest("POST", { reason: "유지" }, managerCookie),
    );
    // Then
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: { code: "CONFLICT" } });
    expect(keepApplied.status).toBe(409);
    expect((await storedGuide(guide.id))?.title).toBe("첫 수정");
    const [revision] = await t.db
      .select()
      .from(guideRevisions)
      .where(eq(guideRevisions.guideId, guide.id));
    expect(revision?.title).toBe("두 번째 수정");
  });

  it("rolls everything back when a memo is not a pending memo of this guide", async () => {
    // Given: one of the ids is a kept memo, another belongs to a different guide
    const { building, guide, memos, managerCookie } = await publishedWithMemos(1);
    const pending = memos[0]?.id as string;
    const kept = await createMemo(t.db, guide.id, null, { status: "kept" });
    const otherGuide = await createGuide(t.db, building.id, { status: "published", position: 2 });
    const foreign = await createMemo(t.db, otherGuide.id, null);
    await patch(guide.id, { title: "반영하려던 수정" }, managerCookie);
    // When
    const withKept = await publish(guide.id, managerCookie, [pending, kept.id]);
    const withForeign = await publish(guide.id, managerCookie, [pending, foreign.id]);
    // Then: published content, the saved revision and every memo are unchanged
    expect(withKept.status).toBe(409);
    expect(withForeign.status).toBe(409);
    expect((await storedGuide(guide.id))?.title).toBe("published 안내");
    expect(await memoStatuses(guide.id)).toEqual({ [pending]: "pending", [kept.id]: "kept" });
    expect(await memoStatuses(otherGuide.id)).toEqual({ [foreign.id]: "pending" });
    const [revision] = await t.db
      .select()
      .from(guideRevisions)
      .where(eq(guideRevisions.guideId, guide.id));
    expect(revision?.title).toBe("반영하려던 수정");
  });

  it("keeps published content, revision and memos when the publish fails midway", async () => {
    // Given
    const { guide, memos, managerCookie } = await publishedWithMemos(1);
    const memoId = memos[0]?.id as string;
    await patch(guide.id, { body: "실패할 수정" }, managerCookie);
    vi.mocked(repo.applyMemos).mockRejectedValueOnce(new Error("memo update failed"));
    // When
    const response = await publish(guide.id, managerCookie, [memoId]);
    // Then
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR" } });
    expect(repo.applyMemos).toHaveBeenCalledTimes(1);
    const stored = await storedGuide(guide.id);
    expect(stored).toMatchObject({ body: "본문", updatedAt: guide.updatedAt });
    expect(await memoStatuses(guide.id)).toEqual({ [memoId]: "pending" });
    const [revision] = await t.db
      .select()
      .from(guideRevisions)
      .where(eq(guideRevisions.guideId, guide.id));
    expect(revision?.body).toBe("실패할 수정");
  });

  it("refuses memo ids on a first publish of a draft and leaves it a draft", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "preparing");
    const draft = await createGuide(t.db, building.id, { status: "draft" });
    // When
    const withMemo = await publish(draft.id, managerCookie, [crypto.randomUUID()]);
    const invalid = await publish(draft.id, managerCookie, ["not-a-uuid"]);
    // Then
    expect(withMemo.status).toBe(409);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED", fields: { "applyMemoIds.0": expect.any(String) } },
    });
    expect((await storedGuide(draft.id))?.status).toBe("draft");
  });

  it("refuses residents and other landlords", async () => {
    // Given
    const { guide, memos, managerCookie, residentCookie } = await publishedWithMemos(1);
    const other = await createManagedBuilding(t.db, "open");
    await patch(guide.id, { title: "공개 전 수정" }, managerCookie);
    // When
    const byResident = await publish(guide.id, residentCookie, [memos[0]?.id as string]);
    const byOther = await publish(guide.id, other.managerCookie);
    // Then
    expect(byResident.status).toBe(403);
    expect(byOther.status).toBe(403);
    expect(await byOther.json()).toEqual({ error: { code: "NOT_BUILDING_MANAGER" } });
    expect((await storedGuide(guide.id))?.title).toBe("published 안내");
  });
});
