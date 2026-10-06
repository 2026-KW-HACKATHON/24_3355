import type {
  ManagedReport,
  Report,
  ReporterKind,
  ReportKind,
  ReportLocation,
  ReportPreset,
  ReportResult,
  ReportStatus,
} from "@wolgyeham/contracts";
import { and, asc, count, desc, eq, gt, inArray, like, lt, sql } from "drizzle-orm";
import { buildings, reportAccessTokens, reportSubmissions, reports } from "../../db/schema.ts";
import type { Database } from "../../lib/db.ts";

type ReportRow = typeof reports.$inferSelect;
type ReportWithBuilding = { report: ReportRow; buildingName: string };

/** 보낸 계정(`reporter_user_id`)과 보낸 사람 구분은 담지 않습니다. */
export function toReport({ report, buildingName }: ReportWithBuilding): Report {
  return {
    id: report.id,
    buildingId: report.buildingId,
    buildingName,
    preset: report.preset,
    kind: report.kind,
    location: report.location,
    body: report.body,
    status: report.status,
    resultNote: report.resultNote,
    createdAt: report.createdAt.toISOString(),
    acknowledgedAt: report.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
  };
}

/** 분 단위로 자른 시각. 집주인에게 받은 시각을 초까지 보내지 않습니다(보낸 사람을 시각으로 짐작하지 않게). */
function toMinute(date: Date): string {
  const minute = new Date(date);
  minute.setUTCSeconds(0, 0);
  return minute.toISOString();
}

/** 집주인에게는 거주자·회원·비회원 구분만 더하고, 받은 시각은 분 단위로 보냅니다. */
export function toManagedReport(row: ReportWithBuilding): ManagedReport {
  return {
    ...toReport(row),
    createdAt: toMinute(row.report.createdAt),
    reporterKind: row.report.reporterKind,
  };
}

const reportWithBuilding = { report: reports, buildingName: buildings.name };
/** 목록의 최대 개수(최근 순). 페이지 나누기는 아직 없습니다. */
const BUILDING_REPORT_LIST_LIMIT = 200;
const MY_REPORT_LIST_LIMIT = 100;

export async function findReportWithBuilding(db: Database, reportId: string) {
  const [row] = await db
    .select(reportWithBuilding)
    .from(reports)
    .innerJoin(buildings, eq(buildings.id, reports.buildingId))
    .where(eq(reports.id, reportId))
    .limit(1);
  return row;
}

/** 이 건물의 제보. 최근에 받은 순서로 최대 200건입니다. */
export function listBuildingReports(
  db: Database,
  buildingId: string,
  status: ReportStatus | undefined,
) {
  return db
    .select(reportWithBuilding)
    .from(reports)
    .innerJoin(buildings, eq(buildings.id, reports.buildingId))
    .where(
      status
        ? and(eq(reports.buildingId, buildingId), eq(reports.status, status))
        : eq(reports.buildingId, buildingId),
    )
    .orderBy(desc(reports.createdAt))
    .limit(BUILDING_REPORT_LIST_LIMIT);
}

/** 이 계정으로 보낸 제보(모든 건물). 최근 순서로 최대 100건입니다. */
export function listUserReports(db: Database, userId: string) {
  return db
    .select(reportWithBuilding)
    .from(reports)
    .innerJoin(buildings, eq(buildings.id, reports.buildingId))
    .where(eq(reports.reporterUserId, userId))
    .orderBy(desc(reports.createdAt))
    .limit(MY_REPORT_LIST_LIMIT);
}

export async function insertReport(
  db: Database,
  values: {
    buildingId: string;
    reporterUserId: string | null;
    reporterKind: ReporterKind;
    preset: ReportPreset | null;
    kind: ReportKind;
    location: ReportLocation | null;
    body: string | null;
  },
) {
  const [row] = await db.insert(reports).values(values).returning();
  return row;
}

export async function insertAccessToken(
  db: Database,
  values: { reportId: string; tokenHash: string; expiresAt: Date },
) {
  await db.insert(reportAccessTokens).values(values);
}

export async function findAccessToken(db: Database, tokenHash: string) {
  const [row] = await db
    .select({ reportId: reportAccessTokens.reportId, expiresAt: reportAccessTokens.expiresAt })
    .from(reportAccessTokens)
    .where(eq(reportAccessTokens.tokenHash, tokenHash))
    .limit(1);
  return row;
}

/** 이 건물 제보의 아직 유효한 조회 토큰(해시)들. 다른 건물·만료된 토큰은 빠집니다. */
export function findReportsByTokenHashes(db: Database, buildingId: string, tokenHashes: string[]) {
  return db
    .select({ tokenHash: reportAccessTokens.tokenHash, ...reportWithBuilding })
    .from(reportAccessTokens)
    .innerJoin(reports, eq(reports.id, reportAccessTokens.reportId))
    .innerJoin(buildings, eq(buildings.id, reports.buildingId))
    .where(
      and(
        inArray(reportAccessTokens.tokenHash, tokenHashes),
        eq(reports.buildingId, buildingId),
        gt(reportAccessTokens.expiresAt, sql`now()`),
      ),
    );
}

/** received → acknowledged. 이미 바뀐 제보면 undefined. */
export async function acknowledgeReport(db: Database, reportId: string) {
  const [row] = await db
    .update(reports)
    .set({ status: "acknowledged", acknowledgedAt: sql`now()` })
    .where(and(eq(reports.id, reportId), eq(reports.status, "received")))
    .returning();
  return row;
}

/** acknowledged → completed | unable. 확인 전이거나 이미 결과를 남긴 제보면 undefined. */
export async function resolveReport(
  db: Database,
  reportId: string,
  result: ReportResult,
  note: string | null,
) {
  const [row] = await db
    .update(reports)
    .set({ status: result, resultNote: note, resolvedAt: sql`now()` })
    .where(and(eq(reports.id, reportId), eq(reports.status, "acknowledged")))
    .returning();
  return row;
}

export async function countNewReports(db: Database, buildingIds: string[]) {
  if (buildingIds.length === 0) return [];
  return db
    .select({ buildingId: reports.buildingId, count: count() })
    .from(reports)
    .where(and(inArray(reports.buildingId, buildingIds), eq(reports.status, "received")))
    .groupBy(reports.buildingId);
}

/** 반복 제한 잠금 공간(두 정수 키). 시드·마이그레이션의 한 정수 키와 겹치지 않습니다. */
const SUBMISSION_LOCK_SPACE = 33550003;

/** (건물, 클라이언트 키)의 접수를 트랜잭션이 끝날 때까지 한 번에 하나씩 처리합니다(동시 요청도 빠짐없이 셈). */
export async function lockSubmissions(db: Database, buildingId: string, clientKey: string) {
  await db.execute(
    sql`select pg_advisory_xact_lock(${SUBMISSION_LOCK_SPACE}, hashtext(${`${buildingId}:${clientKey}`}))`,
  );
}

/** `since` 뒤의 접수 기록. 오래된 것부터입니다. */
export function listSubmissionsSince(
  db: Database,
  buildingId: string,
  clientKey: string,
  since: Date,
) {
  return db
    .select({ contentHash: reportSubmissions.contentHash, createdAt: reportSubmissions.createdAt })
    .from(reportSubmissions)
    .where(
      and(
        eq(reportSubmissions.buildingId, buildingId),
        eq(reportSubmissions.clientKey, clientKey),
        gt(reportSubmissions.createdAt, since),
      ),
    )
    .orderBy(asc(reportSubmissions.createdAt));
}

export async function insertSubmission(
  db: Database,
  values: { buildingId: string; clientKey: string; contentHash: string },
) {
  await db.insert(reportSubmissions).values(values);
}

/** 한 번에 지우는 오래된 행 수. 제보할 때마다 조금씩 지워 요청 시간이 늘지 않게 합니다. */
const CLEANUP_LIMIT = 100;

/** 하루 지난 접수 기록을 건물과 관계없이 100행까지 지웁니다(IP 키를 오래 두지 않음). */
export async function deleteOldSubmissions(db: Database) {
  const old = db
    .select({ id: reportSubmissions.id })
    .from(reportSubmissions)
    .where(lt(reportSubmissions.createdAt, sql`now() - interval '1 day'`))
    .limit(CLEANUP_LIMIT);
  await db.delete(reportSubmissions).where(inArray(reportSubmissions.id, old));
}

/**
 * 만료된 지 30일이 지난 조회 토큰을 100행까지 지웁니다. 만료 직후에는 남겨 두어 확인 링크를 연 사람이
 * ‘보관 기간이 지나…’(410)를 보게 하고, 그 뒤에는 지워서 없는 링크(404)가 됩니다.
 */
export async function deleteExpiredAccessTokens(db: Database) {
  const expired = db
    .select({ id: reportAccessTokens.id })
    .from(reportAccessTokens)
    .where(lt(reportAccessTokens.expiresAt, sql`now() - interval '30 days'`))
    .limit(CLEANUP_LIMIT);
  await db.delete(reportAccessTokens).where(inArray(reportAccessTokens.id, expired));
}

/** 이 건물에 최근 한 시간 동안 로그인하지 않고(IP 키) 보낸 제보 수. */
export async function countGuestSubmissionsSince(db: Database, buildingId: string, since: Date) {
  const [row] = await db
    .select({ value: count() })
    .from(reportSubmissions)
    .where(
      and(
        eq(reportSubmissions.buildingId, buildingId),
        like(reportSubmissions.clientKey, "ip:%"),
        gt(reportSubmissions.createdAt, since),
      ),
    );
  return row?.value ?? 0;
}
