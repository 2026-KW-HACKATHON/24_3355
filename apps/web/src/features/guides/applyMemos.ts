import { APPLY_MEMO_IDS_MAX } from "@wolgyeham/contracts";

// 반영할 메모(25 → 33 → 43). 쓰기 ↔ 미리 보기를 `replace`로 오가도, 새로고침해도 남도록 주소 쿼리에 둡니다.
export const APPLY_PARAM = "apply";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?apply=a,b`에서 메모 id만 골라 냅니다(중복·모양이 틀린 값은 뺌). */
export function readApplyIds(search: string): string[] {
  const raw = new URLSearchParams(search).get(APPLY_PARAM) ?? "";
  const ids = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => UUID.test(item));
  return [...new Set(ids)].slice(0, APPLY_MEMO_IDS_MAX);
}

/** 주소 뒤에 붙일 쿼리. 비어 있으면 빈 문자열입니다. */
export function applySearch(ids: readonly string[]): string {
  return ids.length > 0 ? `?${APPLY_PARAM}=${ids.join(",")}` : "";
}

/** 지금도 확인 전인 메모만 남깁니다. 다른 곳에서 먼저 반영·유지했으면 빠집니다. */
export function stillPending(ids: readonly string[], pendingIds: readonly string[]): string[] {
  const pending = new Set(pendingIds);
  return ids.filter((id) => pending.has(id));
}
