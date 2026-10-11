import { safeReturnTo } from "../../lib/returnTo";
import { isCompleteJoinCode } from "./joinCode";

// 연결(LF-04)은 가입코드(1/2) → 카카오 로그인(2/2)으로 이어집니다. 로그인을 거치면 화면 상태가
// 사라지므로 확인한 코드를 잠깐 둡니다. 안드로이드는 카카오톡 앱으로 로그인한 뒤 새 탭으로 돌아오기도 해서
// 탭마다 따로인 sessionStorage가 아니라 localStorage에 10분만 둡니다. 돌아와도 자동으로 보내지 않습니다.
const KEY = "wh.connect";
const TTL_MS = 10 * 60 * 1000;

export type ConnectDraft = {
  buildingId: string;
  buildingName: string;
  code: string;
  returnTo: string;
  savedAt: number;
};

function isDraft(value: unknown): value is ConnectDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft["buildingId"] === "string" &&
    typeof draft["buildingName"] === "string" &&
    typeof draft["code"] === "string" &&
    typeof draft["returnTo"] === "string" &&
    typeof draft["savedAt"] === "number"
  );
}

export function saveConnectDraft(draft: Omit<ConnectDraft, "savedAt">, now = Date.now()) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: now }));
  } catch {
    // 저장하지 못하면 로그인 뒤 코드를 다시 넣어야 합니다.
  }
}

/** 이 건물에서 10분 안에 확인한 코드만 돌려줍니다. 오래됐거나 모양이 틀리면 지웁니다. */
export function loadConnectDraft(buildingId: string, now = Date.now()): ConnectDraft | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return undefined;
  }
  if (!isDraft(parsed)) return undefined;
  const fresh = now - parsed.savedAt < TTL_MS && parsed.savedAt <= now;
  if (!fresh || !isCompleteJoinCode(parsed.code)) {
    clearConnectDraft();
    return undefined;
  }
  if (parsed.buildingId !== buildingId) return undefined;
  return { ...parsed, returnTo: resolveConnectReturnTo(parsed.returnTo, buildingId) };
}

export function clearConnectDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}

/**
 * 연결을 마친 뒤 돌아갈 곳. 같은 건물 화면(`/b/:buildingId…`)만 받고, 연결 화면 자신이나
 * 다른 건물·다른 사이트면 그 건물 홈으로 보냅니다.
 */
export function resolveConnectReturnTo(raw: string | null | undefined, buildingId: string): string {
  const home = `/b/${buildingId}`;
  if (!raw) return home;
  const path = safeReturnTo(raw);
  const [pathname = ""] = path.split("?");
  const sameBuilding = pathname === home || pathname.startsWith(`${home}/`);
  if (!sameBuilding || pathname === `${home}/connect`) return home;
  return path;
}

/**
 * 쿼리 값으로 넣는 경로. `/`는 그대로 둡니다. 로그인 돌아올 곳(contracts `ReturnTo`)은 인코딩한 `/`(`%2F`)를 받지
 * 않아, 인코딩하면 카카오 로그인 뒤 연결 화면이 아니라 첫 화면으로 돌아갑니다.
 */
function encodeReturnTo(path: string): string {
  return encodeURIComponent(path).replace(/%2F/gi, "/");
}

/** 연결 화면 주소. 돌아올 곳이 건물 홈이면 쿼리를 붙이지 않습니다. */
export function connectPath(buildingId: string, returnTo?: string): string {
  const base = `/b/${buildingId}/connect`;
  const target = resolveConnectReturnTo(returnTo, buildingId);
  return target === `/b/${buildingId}` ? base : `${base}?returnTo=${encodeReturnTo(target)}`;
}
