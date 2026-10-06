import {
  CORRECTION_MEMO_REPEAT_SECONDS,
  type CorrectionMemoListQuery,
  type CreateCorrectionMemoBody,
  type CreateGuideBody,
  type Guide,
  type GuideCorrectionMemo,
  type GuideRevisionResponse,
  type ManagedCorrectionMemo,
  type ManagedGuide,
  type PublishGuideBody,
  type PublishGuideResult,
  type UpdateGuideBody,
} from "@wolgyeham/contracts";
import { isManager, requireManager, requireOccupancy } from "../../lib/auth.ts";
import type { SessionUser } from "../../lib/context.ts";
import type { Database } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import * as buildingService from "../buildings/service.ts";
import * as repo from "./repo.ts";

async function requireGuide(db: Database, guideId: string) {
  const guide = await repo.findGuide(db, guideId);
  if (!guide) throw new AppError(404, "NOT_FOUND");
  return guide;
}

export async function listPublishedGuides(db: Database, buildingId: string): Promise<Guide[]> {
  await buildingService.requireBuilding(db, buildingId);
  return (await repo.listGuides(db, buildingId, true)).map(repo.toGuide);
}

/** 권한 확인은 부르는 쪽이 합니다(관리 화면). 초안을 포함합니다. */
export async function listAllGuides(db: Database, buildingId: string): Promise<Guide[]> {
  return (await repo.listGuides(db, buildingId, false)).map(repo.toGuide);
}

/** 공개된 안내는 누구나, 초안은 그 건물 관리자만 봅니다. 볼 수 없는 초안은 404로 숨깁니다. */
export async function getGuide(
  db: Database,
  user: SessionUser | null,
  guideId: string,
): Promise<Guide> {
  const guide = await requireGuide(db, guideId);
  if (guide.status === "published") return repo.toGuide(guide);
  if (user && (await isManager(db, user.id, guide.buildingId))) return repo.toGuide(guide);
  throw new AppError(404, "NOT_FOUND");
}

export async function createDraft(
  db: Database,
  userId: string,
  buildingId: string,
  input: CreateGuideBody,
): Promise<Guide> {
  const building = await buildingService.requireBuilding(db, buildingId);
  await requireManager(db, userId, building.id);
  const row = await repo.insertDraft(db, {
    ...input,
    buildingId: building.id,
    authorUserId: userId,
  });
  if (!row) throw new Error("guide insert returned no row");
  return repo.toGuide(row);
}

/**
 * 안내 고치기. 초안은 그대로 고치고, 공개된 안내는 공개 내용을 두고 수정본에 저장합니다(보내지 않은 필드는
 * 이전 수정본, 없으면 공개 내용에서 가져옴). 수정본은 `publish`(수정 공개)를 해야 공개 내용이 됩니다.
 */
export async function updateGuide(
  db: Database,
  userId: string,
  guideId: string,
  patch: UpdateGuideBody,
): Promise<ManagedGuide> {
  const guide = await requireGuide(db, guideId);
  await requireManager(db, userId, guide.buildingId);
  if (guide.status === "draft") {
    const row = await repo.updateDraft(db, guide.id, patch);
    if (!row) throw new AppError(409, "CONFLICT");
    return { ...repo.toGuide(row), revision: null };
  }
  const revision = await repo.upsertRevision(db, guide, patch, userId);
  if (!revision) throw new Error("guide revision upsert returned no row");
  return { ...repo.toGuide(guide), revision: repo.toRevision(revision) };
}

/** 공개된 안내의 저장한 수정본(집주인). 없으면 null. */
export async function getRevision(
  db: Database,
  userId: string,
  guideId: string,
): Promise<GuideRevisionResponse> {
  const guide = await requireGuide(db, guideId);
  await requireManager(db, userId, guide.buildingId);
  const row = await repo.findRevision(db, guide.id);
  return { revision: row ? repo.toRevision(row) : null };
}

/** 편집 취소: 수정본만 지웁니다. 공개 내용과 메모 상태는 그대로입니다. 없어도 성공입니다. */
export async function discardRevision(db: Database, userId: string, guideId: string) {
  const guide = await requireGuide(db, guideId);
  await requireManager(db, userId, guide.buildingId);
  await repo.deleteRevision(db, guide.id);
}

/**
 * 공개와 수정 공개는 트랜잭션 하나입니다.
 * - 초안: draft → published, 건물의 첫 공개면 preparing → open.
 * - 공개된 안내: 저장한 수정본을 공개 내용으로 옮기고 수정본을 지움. 수정본이 없으면 409.
 * - `applyMemoIds`: 이 안내의 pending 메모를 applied로. 하나라도 이 안내의 pending 메모가 아니면 409이고
 *   모두 되돌려져 공개 내용·수정본·메모 상태가 그대로 남습니다.
 */
export async function publish(
  db: Database,
  userId: string,
  guideId: string,
  input: PublishGuideBody,
): Promise<PublishGuideResult> {
  const guide = await requireGuide(db, guideId);
  await requireManager(db, userId, guide.buildingId);
  const memoIds = [...new Set(input.applyMemoIds)];
  return db.transaction(async (tx) => {
    let row: Awaited<ReturnType<typeof repo.publishDraft>>;
    let buildingOpened = false;
    if (guide.status === "draft") {
      row = await repo.publishDraft(tx, guide.id);
      if (!row) throw new AppError(409, "CONFLICT");
      buildingOpened = await buildingService.openIfPreparing(tx, row.buildingId);
    } else {
      const revision = await repo.deleteRevision(tx, guide.id);
      if (!revision) throw new AppError(409, "CONFLICT");
      row = await repo.applyRevision(tx, guide.id, revision);
      if (!row) throw new AppError(409, "CONFLICT");
    }
    const appliedMemoIds = await repo.applyMemos(tx, guide.id, memoIds);
    if (appliedMemoIds.length !== memoIds.length) throw new AppError(409, "CONFLICT");
    return { guide: repo.toGuide(row), buildingOpened, appliedMemoIds };
  });
}

export async function countGuides(db: Database, buildingIds: string[]) {
  const counts = new Map<string, { published: number; draft: number }>();
  for (const row of await repo.countByBuildingAndStatus(db, buildingIds)) {
    const entry = counts.get(row.buildingId) ?? { published: 0, draft: 0 };
    entry[row.status] = row.count;
    counts.set(row.buildingId, entry);
  }
  return counts;
}

/** 건물별 확인 전(pending) 메모 수. 권한 확인은 부르는 쪽이 합니다(관리 화면). */
export async function countPendingMemos(db: Database, buildingIds: string[]) {
  const counts = new Map<string, number>();
  for (const row of await repo.countPendingMemos(db, buildingIds)) {
    counts.set(row.buildingId, row.count);
  }
  return counts;
}

/** 메모는 공개된 안내에만 붙습니다. 초안은 관리자 말고는 없는 것처럼 404입니다. */
async function requirePublishedGuide(db: Database, guideId: string) {
  const guide = await requireGuide(db, guideId);
  if (guide.status !== "published") throw new AppError(404, "NOT_FOUND");
  return guide;
}

/**
 * 내용이 달라요(12). 이 건물의 active 거주자만 씁니다. 집주인은 403 `FORBIDDEN`, 연결이 없거나 끝났으면
 * 403 `NOT_CONNECTED`, 재확인이 필요하면 403 `RECONFIRM_NEEDED`입니다. 같은 사람이 같은 안내에 60초 안에
 * 다시 남기면 429 `RATE_LIMITED`(`Retry-After`)입니다(동시 요청도 한 줄로 세움).
 */
export async function createMemo(
  db: Database,
  userId: string,
  guideId: string,
  input: CreateCorrectionMemoBody,
): Promise<GuideCorrectionMemo> {
  const guide = await requirePublishedGuide(db, guideId);
  if (await isManager(db, userId, guide.buildingId)) throw new AppError(403, "FORBIDDEN");
  await requireOccupancy(db, userId, guide.buildingId, { allow: ["active"] });
  return db.transaction(async (tx) => {
    await repo.lockMemoWriter(tx, guide.id, userId);
    const last = await repo.findLastMemoAt(tx, guide.id, userId);
    const retryAt = last ? last.getTime() + CORRECTION_MEMO_REPEAT_SECONDS * 1000 : 0;
    if (retryAt > Date.now()) {
      const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
      throw new AppError(429, "RATE_LIMITED", undefined, { "Retry-After": String(seconds) });
    }
    const row = await repo.insertMemo(tx, {
      guideId: guide.id,
      authorUserId: userId,
      body: input.body,
    });
    if (!row) throw new Error("correction memo insert returned no row");
    return { ...repo.toCorrectionMemo(row), mine: true };
  });
}

/**
 * 안내 아래의 메모(거주자는 active·reconfirm_needed, 그리고 집주인). 작성자는 내보내지 않고, 요청한 사람이 쓴
 * 메모에만 `mine`을 붙입니다(내 메모 상태: 확인 전·반영됨·기존 유지).
 */
export async function listGuideMemos(
  db: Database,
  userId: string,
  guideId: string,
): Promise<GuideCorrectionMemo[]> {
  const guide = await requireGuide(db, guideId);
  if (!(await isManager(db, userId, guide.buildingId))) {
    if (guide.status !== "published") throw new AppError(404, "NOT_FOUND");
    await requireOccupancy(db, userId, guide.buildingId, { allow: ["active", "reconfirm_needed"] });
  }
  const rows = await repo.listGuideMemos(db, guide.id);
  return rows.map((row) => ({ ...repo.toCorrectionMemo(row), mine: row.authorUserId === userId }));
}

type MemoWithGuide = NonNullable<Awaited<ReturnType<typeof repo.findMemoWithGuide>>>;

function toManagedMemo(row: MemoWithGuide): ManagedCorrectionMemo {
  return {
    ...repo.toCorrectionMemo(row.memo),
    guideTitle: row.guideTitle,
    guideCategory: row.guideCategory,
  };
}

/** 집주인의 메모 목록(LF-13 확인할 것·LF-17). 확인 전이 먼저입니다. */
export async function listBuildingMemos(
  db: Database,
  userId: string,
  buildingId: string,
  query: CorrectionMemoListQuery,
): Promise<ManagedCorrectionMemo[]> {
  const building = await buildingService.requireBuilding(db, buildingId);
  await requireManager(db, userId, building.id);
  return (await repo.listBuildingMemos(db, building.id, query.status)).map(toManagedMemo);
}

async function requireManagedMemo(db: Database, userId: string, memoId: string) {
  const row = await repo.findMemoWithGuide(db, memoId);
  if (!row) throw new AppError(404, "NOT_FOUND");
  await requireManager(db, userId, row.buildingId);
  return row;
}

/** 메모 하나(LF-17 검토, 집주인 알림에서 열기). */
export async function getMemo(
  db: Database,
  userId: string,
  memoId: string,
): Promise<ManagedCorrectionMemo> {
  return toManagedMemo(await requireManagedMemo(db, userId, memoId));
}

/** 기존 안내 유지: pending → kept, 사유 필수. 이미 반영·유지한 메모면 409 `CONFLICT`. */
export async function keepMemo(
  db: Database,
  userId: string,
  memoId: string,
  reason: string,
): Promise<ManagedCorrectionMemo> {
  const current = await requireManagedMemo(db, userId, memoId);
  const row = await repo.keepMemo(db, current.memo.id, reason);
  if (!row) throw new AppError(409, "CONFLICT");
  return toManagedMemo({ ...current, memo: row });
}
