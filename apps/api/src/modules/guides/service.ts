import type {
  CreateGuideBody,
  Guide,
  PublishGuideResult,
  UpdateGuideBody,
} from "@wolgyeham/contracts";
import { isManager, requireManager } from "../../lib/auth.ts";
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

export async function updateDraft(
  db: Database,
  userId: string,
  guideId: string,
  patch: UpdateGuideBody,
): Promise<Guide> {
  const guide = await requireGuide(db, guideId);
  await requireManager(db, userId, guide.buildingId);
  const row = await repo.updateDraft(db, guide.id, patch);
  if (!row) throw new AppError(409, "CONFLICT");
  return repo.toGuide(row);
}

/** 안내 공개와 건물의 첫 공개(preparing → open)는 한 트랜잭션입니다. */
export async function publish(
  db: Database,
  userId: string,
  guideId: string,
): Promise<PublishGuideResult> {
  const guide = await requireGuide(db, guideId);
  await requireManager(db, userId, guide.buildingId);
  return db.transaction(async (tx) => {
    const row = await repo.publishDraft(tx, guide.id);
    if (!row) throw new AppError(409, "CONFLICT");
    const buildingOpened = await buildingService.openIfPreparing(tx, row.buildingId);
    return { guide: repo.toGuide(row), buildingOpened };
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
