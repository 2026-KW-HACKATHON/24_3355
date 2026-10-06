import type {
  CorrectionMemo,
  CorrectionMemoStatus,
  CreateGuideBody,
  Guide,
  GuideRevision,
  UpdateGuideBody,
} from "@wolgyeham/contracts";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { correctionMemos, guideRevisions, guides } from "../../db/schema.ts";
import type { Database } from "../../lib/db.ts";

type GuideRow = typeof guides.$inferSelect;
type RevisionRow = typeof guideRevisions.$inferSelect;
type MemoRow = typeof correctionMemos.$inferSelect;

export function toGuide(row: GuideRow): Guide {
  return {
    id: row.id,
    buildingId: row.buildingId,
    category: row.category,
    title: row.title,
    body: row.body,
    photos: row.photos.map((key) => ({ url: key })),
    status: row.status,
    position: row.position,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listGuides(db: Database, buildingId: string, publishedOnly: boolean) {
  return db
    .select()
    .from(guides)
    .where(
      publishedOnly
        ? and(eq(guides.buildingId, buildingId), eq(guides.status, "published"))
        : eq(guides.buildingId, buildingId),
    )
    .orderBy(asc(guides.position), asc(guides.createdAt));
}

export async function findGuide(db: Database, guideId: string) {
  const [row] = await db.select().from(guides).where(eq(guides.id, guideId)).limit(1);
  return row;
}

/** 새 초안은 그 건물 안내의 맨 뒤에 붙습니다. */
export async function insertDraft(
  db: Database,
  values: CreateGuideBody & { buildingId: string; authorUserId: string },
) {
  const [row] = await db
    .insert(guides)
    .values({
      ...values,
      status: "draft",
      position: sql`(select coalesce(max(${guides.position}), 0) + 1 from ${guides} where ${guides.buildingId} = ${values.buildingId})`,
    })
    .returning();
  return row;
}

/** 초안만 고칩니다. 그 사이 공개된 안내면 0건이라 undefined를 돌려줍니다. */
export async function updateDraft(db: Database, guideId: string, patch: UpdateGuideBody) {
  const [row] = await db
    .update(guides)
    .set(patch)
    .where(and(eq(guides.id, guideId), eq(guides.status, "draft")))
    .returning();
  return row;
}

/** draft → published. 이미 바뀐 안내면 undefined. */
export async function publishDraft(db: Database, guideId: string) {
  const [row] = await db
    .update(guides)
    .set({ status: "published", publishedAt: sql`now()` })
    .where(and(eq(guides.id, guideId), eq(guides.status, "draft")))
    .returning();
  return row;
}

export async function countByBuildingAndStatus(db: Database, buildingIds: string[]) {
  if (buildingIds.length === 0) return [];
  return db
    .select({ buildingId: guides.buildingId, status: guides.status, count: count() })
    .from(guides)
    .where(inArray(guides.buildingId, buildingIds))
    .groupBy(guides.buildingId, guides.status);
}

export function toRevision(row: RevisionRow): GuideRevision {
  return {
    guideId: row.guideId,
    category: row.category,
    title: row.title,
    body: row.body,
    savedAt: row.updatedAt.toISOString(),
  };
}

export async function findRevision(db: Database, guideId: string) {
  const [row] = await db
    .select()
    .from(guideRevisions)
    .where(eq(guideRevisions.guideId, guideId))
    .limit(1);
  return row;
}

/**
 * 공개된 안내의 수정본에 보낸 필드만 저장합니다. 안내마다 한 행이고, 처음이면 보내지 않은 필드를 공개 내용에서
 * 채웁니다. 이미 있으면 보낸 필드만 한 문장(ON CONFLICT)에서 바꿔서, 동시에 다른 필드를 고친 요청끼리 서로의
 * 변경을 덮어쓰지 않습니다. 공개 내용은 건드리지 않습니다.
 */
export async function upsertRevision(
  db: Database,
  guide: GuideRow,
  patch: UpdateGuideBody,
  authorUserId: string,
) {
  const [row] = await db
    .insert(guideRevisions)
    .values({
      guideId: guide.id,
      category: patch.category ?? guide.category,
      title: patch.title ?? guide.title,
      body: patch.body ?? guide.body,
      authorUserId,
    })
    .onConflictDoUpdate({
      target: guideRevisions.guideId,
      set: {
        ...(patch.category === undefined ? {} : { category: sql`excluded.category` }),
        ...(patch.title === undefined ? {} : { title: sql`excluded.title` }),
        ...(patch.body === undefined ? {} : { body: sql`excluded.body` }),
        authorUserId,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return row;
}

/** 수정본을 지우고 지운 행을 돌려줍니다. 없으면 undefined. 수정 공개는 이것으로 수정본을 한 번만 가져갑니다. */
export async function deleteRevision(db: Database, guideId: string) {
  const [row] = await db
    .delete(guideRevisions)
    .where(eq(guideRevisions.guideId, guideId))
    .returning();
  return row;
}

/** 수정본의 내용을 공개 내용으로 옮깁니다(published → published). 공개된 안내가 아니면 undefined. */
export async function applyRevision(db: Database, guideId: string, revision: RevisionRow) {
  const [row] = await db
    .update(guides)
    .set({ category: revision.category, title: revision.title, body: revision.body })
    .where(and(eq(guides.id, guideId), eq(guides.status, "published")))
    .returning();
  return row;
}

/** 작성자(`author_user_id`)는 응답에 넣지 않습니다. */
export function toCorrectionMemo(row: MemoRow): CorrectionMemo {
  return {
    id: row.id,
    guideId: row.guideId,
    body: row.body,
    status: row.status,
    keptReason: row.keptReason,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

/** 안내 아래 메모 목록과 집주인 메모 목록의 최대 개수. 페이지 나누기는 아직 없습니다. */
const GUIDE_MEMO_LIST_LIMIT = 100;
const BUILDING_MEMO_LIST_LIMIT = 200;
/** 메모 반복 작성 잠금 공간(두 정수 키). */
const MEMO_LOCK_SPACE = 33550004;

/** (작성자, 안내)의 메모 작성을 트랜잭션이 끝날 때까지 한 번에 하나씩 처리합니다. */
export async function lockMemoWriter(db: Database, guideId: string, authorUserId: string) {
  await db.execute(
    sql`select pg_advisory_xact_lock(${MEMO_LOCK_SPACE}, hashtext(${`${guideId}:${authorUserId}`}))`,
  );
}

/** 이 사람이 이 안내에 마지막으로 남긴 메모의 시각. 없으면 undefined. */
export async function findLastMemoAt(db: Database, guideId: string, authorUserId: string) {
  const [row] = await db
    .select({ createdAt: correctionMemos.createdAt })
    .from(correctionMemos)
    .where(
      and(eq(correctionMemos.guideId, guideId), eq(correctionMemos.authorUserId, authorUserId)),
    )
    .orderBy(desc(correctionMemos.createdAt))
    .limit(1);
  return row?.createdAt;
}

export async function insertMemo(
  db: Database,
  values: { guideId: string; authorUserId: string; body: string },
) {
  const [row] = await db.insert(correctionMemos).values(values).returning();
  return row;
}

/** 이 안내의 메모. 최근에 쓴 순서로 최대 100개입니다. */
export function listGuideMemos(db: Database, guideId: string) {
  return db
    .select()
    .from(correctionMemos)
    .where(eq(correctionMemos.guideId, guideId))
    .orderBy(desc(correctionMemos.createdAt))
    .limit(GUIDE_MEMO_LIST_LIMIT);
}

const memoWithGuide = {
  memo: correctionMemos,
  guideTitle: guides.title,
  guideCategory: guides.category,
  buildingId: guides.buildingId,
};

/** 이 건물 안내들의 메모와 안내 제목·종류. 확인 전(pending)이 먼저, 그다음 최근에 쓴 순서입니다. */
export function listBuildingMemos(
  db: Database,
  buildingId: string,
  status: CorrectionMemoStatus | undefined,
) {
  return db
    .select(memoWithGuide)
    .from(correctionMemos)
    .innerJoin(guides, eq(guides.id, correctionMemos.guideId))
    .where(
      status
        ? and(eq(guides.buildingId, buildingId), eq(correctionMemos.status, status))
        : eq(guides.buildingId, buildingId),
    )
    .orderBy(sql`${correctionMemos.status} = 'pending' desc`, desc(correctionMemos.createdAt))
    .limit(BUILDING_MEMO_LIST_LIMIT);
}

export async function findMemoWithGuide(db: Database, memoId: string) {
  const [row] = await db
    .select(memoWithGuide)
    .from(correctionMemos)
    .innerJoin(guides, eq(guides.id, correctionMemos.guideId))
    .where(eq(correctionMemos.id, memoId))
    .limit(1);
  return row;
}

/** pending → kept(사유와 함께). 이미 바뀐 메모면 undefined. */
export async function keepMemo(db: Database, memoId: string, reason: string) {
  const [row] = await db
    .update(correctionMemos)
    .set({ status: "kept", keptReason: reason, resolvedAt: sql`now()` })
    .where(and(eq(correctionMemos.id, memoId), eq(correctionMemos.status, "pending")))
    .returning();
  return row;
}

/** 이 안내의 pending 메모를 applied로 바꾸고 바꾼 id를 돌려줍니다. 공개 트랜잭션 안에서만 부릅니다. */
export async function applyMemos(db: Database, guideId: string, memoIds: string[]) {
  if (memoIds.length === 0) return [];
  const rows = await db
    .update(correctionMemos)
    .set({ status: "applied", resolvedAt: sql`now()` })
    .where(
      and(
        eq(correctionMemos.guideId, guideId),
        inArray(correctionMemos.id, memoIds),
        eq(correctionMemos.status, "pending"),
      ),
    )
    .returning({ id: correctionMemos.id });
  return rows.map((row) => row.id);
}

export async function countPendingMemos(db: Database, buildingIds: string[]) {
  if (buildingIds.length === 0) return [];
  return db
    .select({ buildingId: guides.buildingId, count: count() })
    .from(correctionMemos)
    .innerJoin(guides, eq(guides.id, correctionMemos.guideId))
    .where(and(inArray(guides.buildingId, buildingIds), eq(correctionMemos.status, "pending")))
    .groupBy(guides.buildingId);
}
