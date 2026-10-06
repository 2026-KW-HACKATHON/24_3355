import type {
  ContentReportResult,
  CreateContentReportBody,
  CreateTipBody,
  MyTip,
  Tip,
  UpdateTipBody,
} from "@wolgyeham/contracts";
import { findLiveOccupancy, isManager, requireOccupancy } from "../../lib/auth.ts";
import type { Database } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import * as buildingService from "../buildings/service.ts";
import * as repo from "./repo.ts";

/** 팁 읽기·신고는 이 건물 active·reconfirm_needed 거주자와 집주인입니다(screens.md §1). */
async function requireTipReader(db: Database, userId: string, buildingId: string) {
  if (await isManager(db, userId, buildingId)) return;
  await requireOccupancy(db, userId, buildingId, { allow: ["active", "reconfirm_needed"] });
}

/** 거주자가 남긴 팁(LF-06). 작성자 없이 작성 월만, 본인 팁에만 `mine`. 운영팀이 가린 팁은 뺍니다. */
export async function listBuildingTips(
  db: Database,
  userId: string,
  buildingId: string,
): Promise<Tip[]> {
  const building = await buildingService.requireBuilding(db, buildingId);
  await requireTipReader(db, userId, building.id);
  return (await repo.listVisibleTips(db, building.id)).map((row) => repo.toTip(row, userId));
}

/**
 * 생활 팁 남기기(LF-07). 이 건물 active 거주자만 씁니다. 집주인은 403 `FORBIDDEN`, 연결이 없거나 끝났으면
 * 403 `NOT_CONNECTED`, 재확인이 필요하면 403 `RECONFIRM_NEEDED`입니다.
 */
export async function createTip(
  db: Database,
  userId: string,
  buildingId: string,
  input: CreateTipBody,
): Promise<Tip> {
  const building = await buildingService.requireBuilding(db, buildingId);
  if (await isManager(db, userId, building.id)) throw new AppError(403, "FORBIDDEN");
  await requireOccupancy(db, userId, building.id, { allow: ["active"] });
  const row = await repo.insertTip(db, { ...input, buildingId: building.id, authorUserId: userId });
  if (!row) throw new Error("tip insert returned no row");
  return repo.toTip(row, userId);
}

/**
 * 본인 팁만 고치고 지웁니다. 남의 팁·없는 팁·지운 팁은 404로 숨기고, 그 건물과의 연결이 끝났으면(이사) 403
 * `NOT_CONNECTED`입니다(운영팀 요청으로 처리). 재확인이 필요한 상태에서는 할 수 있습니다.
 */
async function requireOwnTip(db: Database, userId: string, tipId: string) {
  const tip = await repo.findTip(db, tipId);
  if (!tip || tip.authorUserId !== userId || tip.deletedAt) throw new AppError(404, "NOT_FOUND");
  await requireOccupancy(db, userId, tip.buildingId, { allow: ["active", "reconfirm_needed"] });
  return tip;
}

export async function updateTip(
  db: Database,
  userId: string,
  tipId: string,
  patch: UpdateTipBody,
): Promise<Tip> {
  const tip = await requireOwnTip(db, userId, tipId);
  // 가린 팁과 검토 전 신고가 있는 팁은 고칠 수 없습니다(신고된 내용을 바꿔 검토를 피하지 못하게). 지우기는 됩니다.
  const row = await repo.updateTip(db, tip.id, patch);
  if (!row) throw new AppError(409, "CONFLICT");
  return repo.toTip(row, userId);
}

/** 작성자 삭제는 목록에서만 빼고(`deleted_at`) 행은 남깁니다. 신고와 운영 기록이 그대로 남습니다. */
export async function deleteTip(db: Database, userId: string, tipId: string) {
  const tip = await requireOwnTip(db, userId, tipId);
  await repo.softDeleteTip(db, tip.id);
}

/**
 * 팁 신고(거주자·집주인). 한 사람이 한 팁에 한 번이고, 다시 신고하면 `alreadyReported`입니다.
 * 가린 팁·지운 팁·없는 팁은 404, 본인 팁은 403 `FORBIDDEN`입니다. 신고할 때의 팁 내용을 함께 남깁니다.
 */
export async function reportTip(
  db: Database,
  userId: string,
  tipId: string,
  input: CreateContentReportBody,
): Promise<ContentReportResult> {
  const tip = await repo.findTip(db, tipId);
  if (!tip || tip.hiddenAt || tip.deletedAt) throw new AppError(404, "NOT_FOUND");
  await requireTipReader(db, userId, tip.buildingId);
  if (tip.authorUserId === userId) throw new AppError(403, "FORBIDDEN");
  const created = await repo.insertContentReport(db, {
    tipId: tip.id,
    reporterUserId: userId,
    reason: input.reason || null,
    tipBody: tip.body,
  });
  return { alreadyReported: !created };
}

/** 내 정보 › 내가 남긴 팁. 가린 팁도 보여주고, 지금 그 건물과 연결돼 있을 때만 `editable`입니다. */
export async function listMyTips(db: Database, userId: string): Promise<MyTip[]> {
  const live = await findLiveOccupancy(db, userId);
  return (await repo.listAuthorTips(db, userId)).map(({ tip, buildingName }) => ({
    ...repo.toTip(tip, userId),
    buildingName,
    hidden: tip.hiddenAt !== null,
    editable: live?.buildingId === tip.buildingId,
  }));
}

/** 건물별 보이는 팁 수. 권한 확인은 부르는 쪽이 합니다(관리 화면). */
export async function countVisibleTips(db: Database, buildingIds: string[]) {
  const counts = new Map<string, number>();
  for (const row of await repo.countVisibleTips(db, buildingIds)) {
    counts.set(row.buildingId, row.count);
  }
  return counts;
}

/** 운영자 검토(LF-19, db:moderate). 검토 전 신고가 있거나 가린 팁입니다. */
export function listTipsForModeration(db: Database) {
  return repo.listTipsForModeration(db);
}

/**
 * 운영자 가림: 목록에서 빠지고, 그 팁의 검토 전 신고는 검토함이 되며, 운영 기록(`moderation_actions`)을 한 행
 * 남깁니다(한 트랜잭션). `operator`는 운영자 이름입니다. 없는 팁이면 undefined.
 */
export function hideTip(db: Database, tipId: string, reason: string | null, operator: string) {
  return db.transaction(async (tx) => {
    const row = await repo.hideTip(tx, tipId, reason);
    if (row) {
      await repo.reviewContentReports(tx, tipId);
      await repo.insertModerationAction(tx, { tipId, action: "hide", reason, operator });
    }
    return row;
  });
}

/**
 * 운영자 복원: 다시 목록에 보이고(작성자가 지운 팁은 그대로 빠짐), 검토 전 신고는 검토함이 되며, 운영 기록을 한 행
 * 남깁니다. 이전 기록은 지우지 않습니다. 없는 팁이면 undefined.
 */
export function restoreTip(db: Database, tipId: string, operator: string) {
  return db.transaction(async (tx) => {
    const row = await repo.restoreTip(tx, tipId);
    if (row) {
      await repo.reviewContentReports(tx, tipId);
      await repo.insertModerationAction(tx, { tipId, action: "restore", reason: null, operator });
    }
    return row;
  });
}
