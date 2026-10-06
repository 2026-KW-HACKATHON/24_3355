import type { CreateTipBody, Tip, UpdateTipBody } from "@wolgyeham/contracts";
import { and, count, desc, eq, inArray, isNotNull, isNull, notExists, or, sql } from "drizzle-orm";
import { buildings, contentReports, moderationActions, tips } from "../../db/schema.ts";
import type { Database } from "../../lib/db.ts";

type TipRow = typeof tips.$inferSelect;
/** 목록의 최대 개수(최근 순). 페이지 나누기는 아직 없습니다. */
const BUILDING_TIP_LIST_LIMIT = 200;
const MY_TIP_LIST_LIMIT = 100;

const monthFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
});

/** 작성 월(`YYYY-MM`, Asia/Seoul). 정확한 시각은 내보내지 않습니다(database.md §3). */
export function createdMonth(date: Date): string {
  return monthFormat.format(date).slice(0, 7);
}

/** 작성자(`author_user_id`)는 응답에 넣지 않고, 요청한 사람이 쓴 팁인지만 알립니다. */
export function toTip(row: TipRow, viewerId: string): Tip {
  return {
    id: row.id,
    buildingId: row.buildingId,
    category: row.category,
    body: row.body,
    createdMonth: createdMonth(row.createdAt),
    mine: row.authorUserId !== null && row.authorUserId === viewerId,
  };
}

export async function findTip(db: Database, tipId: string) {
  const [row] = await db.select().from(tips).where(eq(tips.id, tipId)).limit(1);
  return row;
}

/** 목록에 보이는 팁: 운영팀이 가리지 않았고 작성자가 지우지 않은 팁. */
const visible = () => and(isNull(tips.hiddenAt), isNull(tips.deletedAt));

/** 이 건물의 보이는 팁. 최근에 쓴 순서로 최대 200개입니다. */
export function listVisibleTips(db: Database, buildingId: string) {
  return db
    .select()
    .from(tips)
    .where(and(eq(tips.buildingId, buildingId), visible()))
    .orderBy(desc(tips.createdAt))
    .limit(BUILDING_TIP_LIST_LIMIT);
}

/** 이 사용자가 쓴 팁(모든 건물, 가린 팁 포함, 지운 팁 제외)과 건물 이름. 최근 순서로 최대 100개입니다. */
export function listAuthorTips(db: Database, userId: string) {
  return db
    .select({ tip: tips, buildingName: buildings.name })
    .from(tips)
    .innerJoin(buildings, eq(buildings.id, tips.buildingId))
    .where(and(eq(tips.authorUserId, userId), isNull(tips.deletedAt)))
    .orderBy(desc(tips.createdAt))
    .limit(MY_TIP_LIST_LIMIT);
}

export async function insertTip(
  db: Database,
  values: CreateTipBody & { buildingId: string; authorUserId: string },
) {
  const [row] = await db.insert(tips).values(values).returning();
  return row;
}

/**
 * 가리지 않았고 지우지 않았으며 검토 전 신고가 없는 팁만 고칩니다(신고된 내용을 고쳐 흔적을 지우지 못하게).
 * 조건에 맞지 않으면 undefined.
 */
export async function updateTip(db: Database, tipId: string, patch: UpdateTipBody) {
  const [row] = await db
    .update(tips)
    .set(patch)
    .where(
      and(
        eq(tips.id, tipId),
        visible(),
        notExists(
          db
            .select({ id: contentReports.id })
            .from(contentReports)
            .where(and(eq(contentReports.tipId, tips.id), eq(contentReports.status, "open"))),
        ),
      ),
    )
    .returning();
  return row;
}

/** 작성자 삭제는 `deleted_at`만 채웁니다(신고·운영 기록이 남도록). 이미 지웠으면 undefined. */
export async function softDeleteTip(db: Database, tipId: string) {
  const [row] = await db
    .update(tips)
    .set({ deletedAt: sql`now()` })
    .where(and(eq(tips.id, tipId), isNull(tips.deletedAt)))
    .returning({ id: tips.id });
  return row;
}

/** 새 신고면 true, 같은 사람이 이미 신고한 팁이면 false. `tipBody`는 신고할 때의 팁 내용입니다. */
export async function insertContentReport(
  db: Database,
  values: { tipId: string; reporterUserId: string; reason: string | null; tipBody: string },
) {
  const rows = await db
    .insert(contentReports)
    .values(values)
    .onConflictDoNothing({ target: [contentReports.tipId, contentReports.reporterUserId] })
    .returning({ id: contentReports.id });
  return rows.length > 0;
}

export async function countVisibleTips(db: Database, buildingIds: string[]) {
  if (buildingIds.length === 0) return [];
  return db
    .select({ buildingId: tips.buildingId, count: count() })
    .from(tips)
    .where(and(inArray(tips.buildingId, buildingIds), visible()))
    .groupBy(tips.buildingId);
}

/** 운영자 검토 대상: 검토 전 신고가 있거나 가려진 팁과 건물 이름, 신고들. */
export async function listTipsForModeration(db: Database) {
  const reported = db
    .selectDistinct({ tipId: contentReports.tipId })
    .from(contentReports)
    .where(eq(contentReports.status, "open"));
  const rows = await db
    .select({ tip: tips, buildingName: buildings.name })
    .from(tips)
    .innerJoin(buildings, eq(buildings.id, tips.buildingId))
    .where(or(inArray(tips.id, reported), isNotNull(tips.hiddenAt)))
    .orderBy(desc(tips.createdAt));
  if (rows.length === 0) return [];
  const reports = await db
    .select()
    .from(contentReports)
    .where(
      inArray(
        contentReports.tipId,
        rows.map((row) => row.tip.id),
      ),
    )
    .orderBy(desc(contentReports.createdAt));
  const actions = await listModerationActions(
    db,
    rows.map((row) => row.tip.id),
  );
  return rows.map((row) => ({
    ...row,
    reports: reports.filter((report) => report.tipId === row.tip.id),
    actions: actions.filter((action) => action.tipId === row.tip.id),
  }));
}

/** 운영자 판단 기록을 한 행 남깁니다(지우지 않음). */
export async function insertModerationAction(
  db: Database,
  values: { tipId: string; action: "hide" | "restore"; reason: string | null; operator: string },
) {
  await db.insert(moderationActions).values(values);
}

export function listModerationActions(db: Database, tipIds: string[]) {
  if (tipIds.length === 0) return Promise.resolve([]);
  return db
    .select()
    .from(moderationActions)
    .where(inArray(moderationActions.tipId, tipIds))
    .orderBy(desc(moderationActions.createdAt));
}

/** 운영자 가림. 이미 가린 팁이면 사유만 바꿉니다. 없으면 undefined. */
export async function hideTip(db: Database, tipId: string, reason: string | null) {
  const [row] = await db
    .update(tips)
    .set({ hiddenAt: sql`coalesce(${tips.hiddenAt}, now())`, hiddenReason: reason })
    .where(eq(tips.id, tipId))
    .returning();
  return row;
}

/** 운영자 복원. 없으면 undefined. */
export async function restoreTip(db: Database, tipId: string) {
  const [row] = await db
    .update(tips)
    .set({ hiddenAt: null, hiddenReason: null })
    .where(eq(tips.id, tipId))
    .returning();
  return row;
}

/** 운영자가 판단한 팁의 검토 전 신고를 검토함으로 바꾸고 바꾼 수를 돌려줍니다. */
export async function reviewContentReports(db: Database, tipId: string) {
  const rows = await db
    .update(contentReports)
    .set({ status: "reviewed", reviewedAt: sql`now()` })
    .where(and(eq(contentReports.tipId, tipId), eq(contentReports.status, "open")))
    .returning({ id: contentReports.id });
  return rows.length;
}
