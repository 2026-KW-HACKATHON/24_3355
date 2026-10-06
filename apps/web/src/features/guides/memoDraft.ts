// 쓰던 수정 메모(12). 로그인이 끝나 다시 로그인하러 갈 때만 이 탭에(sessionStorage) 잠깐 둡니다.
// 돌아오면 같은 안내의 메모 시트에 채우고, 자동으로 보내지 않습니다(frontend.md §5).
const KEY = "wh.memoDraft";
const TTL_MS = 30 * 60 * 1000;

/** 돌아온 안내 상세에서 메모 시트를 여는 쿼리(`?memo=write`). 연결(44)·다시 로그인 뒤에 씁니다. */
export const MEMO_PARAM = "memo";
export const MEMO_WRITE = "write";

type Stored = { guideId: string; body: string; savedAt: number };

function isStored(value: unknown): value is Stored {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["guideId"] === "string" &&
    typeof v["body"] === "string" &&
    typeof v["savedAt"] === "number"
  );
}

export function saveMemoDraft(guideId: string, body: string, now = Date.now()) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ guideId, body, savedAt: now }));
  } catch {
    // 저장하지 못하면 돌아와서 다시 써야 합니다.
  }
}

/** 이 안내에서 30분 안에 남긴 것만 돌려줍니다. 한 번 읽으면 지웁니다. */
export function takeMemoDraft(guideId: string, now = Date.now()): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {
    return undefined;
  }
  if (!isStored(parsed) || parsed.guideId !== guideId) return undefined;
  clearMemoDraft();
  const fresh = now - parsed.savedAt < TTL_MS && parsed.savedAt <= now;
  return fresh ? parsed.body : undefined;
}

export function clearMemoDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}

/**
 * `?memo=write`로 돌아왔을 때 할 일. 내 정보를 아직 모르거나(불러오는 중·불러오지 못함) 알림 선택(17)이
 * 떠 있으면 기다립니다. 불러오지 못했을 때 지우면 연결된 거주자의 쓰던 메모가 사라집니다(리뷰 M2).
 */
export function memoReturnAction({
  wantsWrite,
  meKnown,
  notifyPending,
  canWrite,
}: {
  wantsWrite: boolean;
  meKnown: boolean;
  notifyPending: boolean;
  canWrite: boolean;
}): "none" | "wait" | "open" | "drop" {
  if (!wantsWrite) return "none";
  if (!meKnown || notifyPending) return "wait";
  return canWrite ? "open" : "drop";
}

/** 안내 상세 주소에 메모 시트를 여는 쿼리를 붙입니다. */
export function memoWritePath(buildingId: string, guideId: string): string {
  return `/b/${buildingId}/guides/${guideId}?${MEMO_PARAM}=${MEMO_WRITE}`;
}
