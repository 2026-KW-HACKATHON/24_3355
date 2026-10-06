import { REPORT_ACCESS_DAYS, REPORT_LOOKUP_MAX } from "@wolgyeham/contracts";
import { publicOrigin } from "./share";

// 비회원 제보의 조회 토큰을 이 브라우저에 건물별로 보관합니다(frontend.md §5 이 브라우저에서 다시 보기).
// 토큰은 제보를 만든 응답에 한 번만 오고, 확인 링크 `/r/:reportId#t=<token>`의 `#` 뒤에만 둡니다.
// API에는 `X-Report-Token` 헤더(상세)나 요청 본문(재조회)으로만 보내고 주소·쿼리에 넣지 않습니다.
const KEY = "wh.reportAccess";
const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_MS = REPORT_ACCESS_DAYS * DAY_MS;

export type ReportAccess = {
  reportId: string;
  buildingId: string;
  token: string;
  savedAt: number;
  /** 서버가 알려 준 확인 링크 만료 시각(ms). 모르면 savedAt + 30일. */
  expiresAt: number;
};

function isAccess(value: unknown): value is ReportAccess {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item["reportId"] === "string" &&
    typeof item["buildingId"] === "string" &&
    typeof item["token"] === "string" &&
    typeof item["savedAt"] === "number" &&
    typeof item["expiresAt"] === "number"
  );
}

function readAll(now: number): ReportAccess[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(isAccess).filter((item) => item.expiresAt > now);
  } catch {
    return []; // 비공개 모드·저장소 차단·깨진 값
  }
}

function writeAll(list: ReportAccess[]): boolean {
  try {
    if (list.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** 만료되지 않은 조회 권한. `buildingId`를 주면 그 건물 것만, 최근에 보낸 것이 뒤에 옵니다. */
export function loadReportAccess(buildingId?: string, now = Date.now()): ReportAccess[] {
  const list = readAll(now);
  return buildingId ? list.filter((item) => item.buildingId === buildingId) : list;
}

export function findReportAccess(reportId: string, now = Date.now()): ReportAccess | undefined {
  return readAll(now).find((item) => item.reportId === reportId);
}

/**
 * 받은 토큰을 저장합니다. 같은 제보는 덮어쓰고, 한 건물에는 재조회 한 번에 보낼 수 있는 수(20)만 남깁니다.
 * 저장하지 못하면 false — 화면은 확인 링크 보관 안내를 더 크게 보여줍니다.
 */
export function saveReportAccess(
  access: { reportId: string; buildingId: string; token: string; expiresAt?: string | null },
  now = Date.now(),
): boolean {
  const parsed = access.expiresAt ? Date.parse(access.expiresAt) : Number.NaN;
  const item: ReportAccess = {
    reportId: access.reportId,
    buildingId: access.buildingId,
    token: access.token,
    savedAt: now,
    expiresAt: Number.isFinite(parsed) ? parsed : now + TTL_MS,
  };
  const others = readAll(now).filter((old) => old.reportId !== item.reportId);
  const sameBuilding = others.filter((old) => old.buildingId === item.buildingId);
  const overflow = new Set(
    sameBuilding.slice(0, Math.max(0, sameBuilding.length - (REPORT_LOOKUP_MAX - 1))),
  );
  return writeAll([...others.filter((old) => !overflow.has(old)), item]);
}

/**
 * 확인 링크(`#t=`)로 연 토큰을 이 브라우저에 보관합니다. 이미 같은 토큰이 있거나 새로 저장했으면 true —
 * 그때만 주소창의 `#t=`를 지웁니다(새로고침해도 보관한 토큰으로 이어서 봄). 보낸 사람으로 확인되기 전이거나
 * 저장하지 못하면(비공개 모드) false이고, 주소의 토큰을 그대로 둡니다.
 */
export function keepLinkToken(
  reportId: string,
  token: string,
  report?: { id: string; buildingId: string; viewer: string; accessExpiresAt: string | null },
  now = Date.now(),
): boolean {
  if (findReportAccess(reportId, now)?.token === token) return true;
  if (report?.viewer !== "reporter" || !report.accessExpiresAt) return false;
  return saveReportAccess(
    {
      reportId: report.id,
      buildingId: report.buildingId,
      token,
      expiresAt: report.accessExpiresAt,
    },
    now,
  );
}

/** 더 이상 쓸 수 없는 토큰(없음·만료·다른 건물)을 지웁니다. */
export function removeReportAccess(tokens: readonly string[], now = Date.now()) {
  if (tokens.length === 0) return;
  const drop = new Set(tokens);
  const list = readAll(now);
  const kept = list.filter((item) => !drop.has(item.token));
  if (kept.length !== list.length) writeAll(kept);
}

/** 확인 링크의 `#t=` 토큰. 없거나 비어 있으면 undefined. */
export function readReportHash(hash: string): string | undefined {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("t")?.trim();
  return token ? token : undefined;
}

/** 앱 안 경로. 토큰은 `#` 뒤에만 둡니다(서버 로그·Referer에 남지 않음). */
export function reportPath(reportId: string, token?: string | null): string {
  const path = `/r/${encodeURIComponent(reportId)}`;
  return token ? `${path}#t=${encodeURIComponent(token)}` : path;
}

/** 복사·공유할 확인 링크(다른 브라우저·기기에서 열기). 출처는 공개 주소(`VITE_PUBLIC_ORIGIN`)를 먼저 씁니다. */
export function reportLink(reportId: string, token: string, origin = publicOrigin()) {
  return `${origin}${reportPath(reportId, token)}`;
}
