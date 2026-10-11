import { PHOTOS_MAX, photoUrl } from "@wolgyeham/contracts";

// 사진 고르기(33·34)의 목록 상태. 화면 순서대로 올린 사진(done), 올리는 중(uploading), 실패(failed)를 둡니다.
// 저장(미리 보기·공지 올리기)에는 올린 사진의 키만 순서대로 보냅니다. 상태 바꾸기는 순수 함수라 따로 시험합니다.
export type PickerItem =
  | { id: string; status: "done"; key: string; url: string }
  | { id: string; status: "uploading" }
  | { id: string; status: "failed"; message: string };

export function fromKeys(keys: readonly string[]): PickerItem[] {
  return keys.map((key) => ({ id: key, status: "done", key, url: photoUrl(key) }));
}

/** 저장할 키(올린 사진만, 순서대로). */
export function keysOf(items: readonly PickerItem[]): string[] {
  return items.flatMap((item) => (item.status === "done" ? [item.key] : []));
}

/** 더 고를 수 있는 장수. 올리는 중·실패한 칸도 자리를 차지합니다(지우면 다시 생김). */
export function remainingSlots(items: readonly PickerItem[], max = PHOTOS_MAX): number {
  return Math.max(0, max - items.length);
}

export function isUploading(items: readonly PickerItem[]): boolean {
  return items.some((item) => item.status === "uploading");
}

export function addUploading(items: readonly PickerItem[], ids: readonly string[]): PickerItem[] {
  return [...items, ...ids.map((id) => ({ id, status: "uploading" as const }))];
}

/** 올리는 중이던 칸을 올린 사진으로. 그 사이 지웠으면 그대로 둡니다. */
export function markDone(items: readonly PickerItem[], id: string, key: string): PickerItem[] {
  return items.map((item) =>
    item.id === id && item.status === "uploading"
      ? { id, status: "done", key, url: photoUrl(key) }
      : item,
  );
}

export function markFailed(
  items: readonly PickerItem[],
  id: string,
  message: string,
): PickerItem[] {
  return items.map((item) =>
    item.id === id && item.status === "uploading" ? { id, status: "failed", message } : item,
  );
}

/** 올린 사진의 썸네일을 불러오지 못함(지워졌거나 연결 문제). 그 칸을 실패로 바꿔 저장에서 뺍니다. */
export function markBroken(
  items: readonly PickerItem[],
  id: string,
  message: string,
): PickerItem[] {
  return items.map((item) =>
    item.id === id && item.status === "done" ? { id, status: "failed", message } : item,
  );
}

export function removeItem(items: readonly PickerItem[], id: string): PickerItem[] {
  return items.filter((item) => item.id !== id);
}

export function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}
