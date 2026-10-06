import { createHash } from "node:crypto";
import {
  type CreateReportBody,
  type CreateReportResult,
  type ManagedReport,
  REPORT_ACCESS_DAYS,
  REPORT_HOURLY_LIMIT,
  REPORT_PRESET_KINDS,
  REPORT_REPEAT_MINUTES,
  type Report,
  type ReportDetail,
  type ReporterKind,
  type ReportListQuery,
  type ReportLookupResult,
  type ResolveReportBody,
} from "@wolgyeham/contracts";
import {
  createToken,
  findLiveOccupancy,
  hashToken,
  isManager,
  requireManager,
} from "../../lib/auth.ts";
import type { SessionUser } from "../../lib/context.ts";
import type { Database } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import * as buildingService from "../buildings/service.ts";
import * as repo from "./repo.ts";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const REPEAT_MS = REPORT_REPEAT_MINUTES * MINUTE_MS;
/** 한 건물이 한 시간에 받는 비회원 제보 수(넘으면 429 `RATE_LIMITED`). */
const REPORT_GUEST_HOURLY_LIMIT_PER_BUILDING = 30;
/** 건물 전체 비회원 제한에 걸렸을 때 다시 해 보라고 알려주는 시간. */
const GUEST_RETRY_MS = 10 * MINUTE_MS;
/** 건물 전체 비회원 제보를 한 줄로 세우는 잠금 키. */
const GUEST_LOCK_KEY = "guests";
/** 조회 토큰은 base64url 43자입니다. 이보다 훨씬 긴 헤더 값은 보지 않고 틀린 토큰으로 봅니다. */
const TOKEN_MAX_LENGTH = 128;

/** 같은 문구인지 보려고 유니코드·대소문자·공백·흔한 문장부호 차이를 없앱니다. */
function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s.,!?~…·'"“”‘’]+/g, "");
}

/** 반복 제한에 쓰는 문구 해시. 자주 쓰는 말은 키와 덧붙인 내용, 직접 적기는 내용만 봅니다. */
function contentHash(input: CreateReportBody) {
  const text =
    input.source === "preset"
      ? `preset:${input.preset}\n${normalizeText(input.detail ?? "")}`
      : `custom:${normalizeText(input.body)}`;
  return createHash("sha256").update(text).digest("hex");
}

function tooFrequent(code: "REPORT_TOO_FREQUENT" | "RATE_LIMITED", retryAt: number) {
  const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
  return new AppError(429, code, undefined, { "Retry-After": String(seconds) });
}

/**
 * 반복 접수 제한. 같은 키가 같은 건물에 같은 문구를 10분 안에 다시 보내면 429 `REPORT_TOO_FREQUENT`,
 * 한 시간에 10건을 넘기면 429 `RATE_LIMITED`입니다. 둘 다 `Retry-After`(남은 초)를 붙입니다.
 */
async function assertNotTooFrequent(
  db: Database,
  buildingId: string,
  clientKey: string,
  hash: string,
) {
  const now = Date.now();
  const recent = await repo.listSubmissionsSince(
    db,
    buildingId,
    clientKey,
    new Date(now - HOUR_MS),
  );
  const lastSame = recent.filter((row) => row.contentHash === hash).at(-1);
  if (lastSame && lastSame.createdAt.getTime() + REPEAT_MS > now) {
    throw tooFrequent("REPORT_TOO_FREQUENT", lastSame.createdAt.getTime() + REPEAT_MS);
  }
  const oldestCounted = recent.at(-REPORT_HOURLY_LIMIT);
  if (recent.length >= REPORT_HOURLY_LIMIT && oldestCounted) {
    throw tooFrequent("RATE_LIMITED", oldestCounted.createdAt.getTime() + HOUR_MS);
  }
}

/** 보낸 시점에 이 건물과 살아 있는 연결(active·reconfirm_needed)이 있으면 거주자, 아니면 회원입니다. */
async function reporterKindOf(db: Database, userId: string, buildingId: string) {
  const live = await findLiveOccupancy(db, userId);
  return (live?.buildingId === buildingId ? "resident" : "member") satisfies ReporterKind;
}

/**
 * 집주인에게 알리기(LF-10). 누구나 보낼 수 있지만 그 건물 집주인은 403 `FORBIDDEN`입니다.
 * 로그인하지 않았으면 조회 토큰(32바이트)을 만들어 응답에 한 번만 담고 SHA-256 해시와 만료 시각(30일)만
 * 저장합니다. 반복 제한 확인·제보·접수 기록·토큰은 (건물, 키) 잠금 아래 한 트랜잭션입니다.
 */
export async function createReport(
  db: Database,
  user: SessionUser | null,
  clientKey: string,
  buildingId: string,
  input: CreateReportBody,
): Promise<CreateReportResult> {
  const building = await buildingService.requireBuilding(db, buildingId);
  let reporterKind: ReporterKind = "guest";
  if (user) {
    if (await isManager(db, user.id, building.id)) throw new AppError(403, "FORBIDDEN");
    reporterKind = await reporterKindOf(db, user.id, building.id);
  }
  const values =
    input.source === "preset"
      ? {
          preset: input.preset,
          kind: REPORT_PRESET_KINDS[input.preset],
          location: null,
          body: input.detail || null,
        }
      : { preset: null, kind: input.kind, location: input.location ?? null, body: input.body };
  const hash = contentHash(input);
  return db.transaction(async (tx) => {
    if (!user) {
      // 비회원 제보는 건물 전체로도 셉니다(여러 IP로 나눠 보내는 스팸). 항상 이 잠금을 먼저 잡아 순서가 꼬이지 않게 합니다.
      await repo.lockSubmissions(tx, building.id, GUEST_LOCK_KEY);
      const guests = await repo.countGuestSubmissionsSince(
        tx,
        building.id,
        new Date(Date.now() - HOUR_MS),
      );
      if (guests >= REPORT_GUEST_HOURLY_LIMIT_PER_BUILDING) {
        throw tooFrequent("RATE_LIMITED", Date.now() + GUEST_RETRY_MS);
      }
    }
    await repo.lockSubmissions(tx, building.id, clientKey);
    await assertNotTooFrequent(tx, building.id, clientKey, hash);
    const report = await repo.insertReport(tx, {
      ...values,
      buildingId: building.id,
      reporterUserId: user?.id ?? null,
      reporterKind,
    });
    if (!report) throw new Error("report insert returned no row");
    await repo.insertSubmission(tx, { buildingId: building.id, clientKey, contentHash: hash });
    await repo.deleteOldSubmissions(tx);
    await repo.deleteExpiredAccessTokens(tx);
    let accessToken: string | null = null;
    let accessExpiresAt: Date | null = null;
    if (!user) {
      accessToken = createToken();
      accessExpiresAt = new Date(Date.now() + REPORT_ACCESS_DAYS * DAY_MS);
      await repo.insertAccessToken(tx, {
        reportId: report.id,
        tokenHash: hashToken(accessToken),
        expiresAt: accessExpiresAt,
      });
    }
    return {
      report: repo.toReport({ report, buildingName: building.name }),
      accessToken,
      accessExpiresAt: accessExpiresAt?.toISOString() ?? null,
    };
  });
}

/**
 * 제보 하나(06·31 보낸 사람, 07·35 집주인). 그 건물 집주인, 이 계정으로 보낸 사람, 또는 `X-Report-Token`의
 * 유효한 토큰만 봅니다. 토큰이 없거나 틀리면(다른 제보의 토큰 포함) 404로 숨기고, 만료면 410
 * `REPORT_LINK_EXPIRED`입니다. 보기만 해서는 상태가 바뀌지 않습니다.
 */
export async function getReport(
  db: Database,
  user: SessionUser | null,
  reportId: string,
  token: string | undefined,
): Promise<ReportDetail> {
  const row = await repo.findReportWithBuilding(db, reportId);
  if (row && user) {
    if (await isManager(db, user.id, row.report.buildingId)) {
      return { ...repo.toManagedReport(row), viewer: "manager", accessExpiresAt: null };
    }
    if (row.report.reporterUserId === user.id) {
      return {
        ...repo.toReport(row),
        viewer: "reporter",
        reporterKind: null,
        accessExpiresAt: null,
      };
    }
  }
  if (!row || !token || token.length > TOKEN_MAX_LENGTH) throw new AppError(404, "NOT_FOUND");
  const access = await repo.findAccessToken(db, hashToken(token));
  if (!access || access.reportId !== row.report.id) throw new AppError(404, "NOT_FOUND");
  if (access.expiresAt.getTime() <= Date.now()) throw new AppError(410, "REPORT_LINK_EXPIRED");
  return {
    ...repo.toReport(row),
    viewer: "reporter",
    reporterKind: null,
    accessExpiresAt: access.expiresAt.toISOString(),
  };
}

/**
 * 같은 브라우저 재조회(30). 이 건물에 보관한 조회 토큰들 중 아직 유효한 것의 제보를 토큰과 같은 순서로 돌려주고,
 * 없거나 만료됐거나 다른 건물의 토큰이면 그 자리를 null로 둡니다.
 */
export async function lookupReports(
  db: Database,
  buildingId: string,
  tokens: string[],
): Promise<ReportLookupResult> {
  const building = await buildingService.requireBuilding(db, buildingId);
  const hashes = tokens.map(hashToken);
  const rows = await repo.findReportsByTokenHashes(db, building.id, [...new Set(hashes)]);
  const byHash = new Map(rows.map((row) => [row.tokenHash, repo.toReport(row)]));
  return { reports: hashes.map((hash) => byHash.get(hash) ?? null) };
}

async function requireManagedReport(db: Database, userId: string, reportId: string) {
  const row = await repo.findReportWithBuilding(db, reportId);
  if (!row) throw new AppError(404, "NOT_FOUND");
  await requireManager(db, userId, row.report.buildingId);
  return row;
}

/** 받은 내용 목록(LF-16, 집주인). 최근에 받은 순서, `?status=received`로 거릅니다. */
export async function listBuildingReports(
  db: Database,
  userId: string,
  buildingId: string,
  query: ReportListQuery,
): Promise<ManagedReport[]> {
  const building = await buildingService.requireBuilding(db, buildingId);
  await requireManager(db, userId, building.id);
  return (await repo.listBuildingReports(db, building.id, query.status)).map(repo.toManagedReport);
}

/** ‘확인했어요’(07): received → acknowledged. 이미 확인했거나 결과를 남긴 제보면 409 `CONFLICT`. */
export async function acknowledgeReport(
  db: Database,
  userId: string,
  reportId: string,
): Promise<ManagedReport> {
  const current = await requireManagedReport(db, userId, reportId);
  const report = await repo.acknowledgeReport(db, current.report.id);
  if (!report) throw new AppError(409, "CONFLICT");
  return repo.toManagedReport({ ...current, report });
}

/**
 * 처리 결과 저장(35): acknowledged → completed | unable, 보낸 분께 한 줄(선택).
 * 확인 전이거나 이미 결과를 남긴 제보면 409 `CONFLICT`.
 */
export async function resolveReport(
  db: Database,
  userId: string,
  reportId: string,
  input: ResolveReportBody,
): Promise<ManagedReport> {
  const current = await requireManagedReport(db, userId, reportId);
  const report = await repo.resolveReport(db, current.report.id, input.result, input.note || null);
  if (!report) throw new AppError(409, "CONFLICT");
  return repo.toManagedReport({ ...current, report });
}

/** 내 정보 › 보낸 내용(21). 이 계정으로 보낸 제보만입니다. 비회원 때 보낸 제보는 붙이지 않습니다. */
export async function listMyReports(db: Database, userId: string): Promise<Report[]> {
  return (await repo.listUserReports(db, userId)).map(repo.toReport);
}

/** 건물별 확인 전(received) 제보 수. 권한 확인은 부르는 쪽이 합니다(관리 화면). */
export async function countNewReports(db: Database, buildingIds: string[]) {
  const counts = new Map<string, number>();
  for (const row of await repo.countNewReports(db, buildingIds)) {
    counts.set(row.buildingId, row.count);
  }
  return counts;
}
