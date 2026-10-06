import { GUIDE_CATEGORIES, type GuideCategory } from "@wolgyeham/contracts";

// 쓰는 중인 안내를 이 기기에 따로 둡니다(lofi 33 “쓰는 중인 내용은 따로 저장돼요”).
// 서버 초안(draft)은 ‘미리 보기’를 누를 때 저장합니다. 저장이 막힌 브라우저에서는 아무것도 하지 않습니다.
// 같은 기기를 다른 계정이 써도 섞이지 않게 사용자별로 두고, 7일이 지나거나 로그아웃하면 지웁니다.
export type GuideFormValues = { category: GuideCategory; title: string; body: string };
type Stored = GuideFormValues & { savedAt: number };

/** 어느 사용자가 어느 건물의 어느 안내(새 안내면 undefined)를 쓰는지. */
export type DraftTarget = { userId: string; buildingId: string; guideId: string | undefined };

export const LOCAL_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PREFIX = "wh.guideDraft.";

const key = ({ userId, buildingId, guideId }: DraftTarget) =>
  `${PREFIX}${userId}.${buildingId}.${guideId ?? "new"}`;

function isStored(value: unknown): value is Stored {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["title"] === "string" &&
    typeof v["body"] === "string" &&
    typeof v["savedAt"] === "number" &&
    (GUIDE_CATEGORIES as readonly unknown[]).includes(v["category"])
  );
}

function parse(raw: string | null): Stored | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStored(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isFresh(draft: Stored, now: number) {
  return now - draft.savedAt <= LOCAL_DRAFT_MAX_AGE_MS;
}

function draftKeys(prefix = PREFIX): string[] {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const item = localStorage.key(index);
    if (item?.startsWith(prefix)) keys.push(item);
  }
  return keys;
}

/** 7일이 지났거나 읽을 수 없는 쓰던 안내를 모두 지웁니다(다른 계정 것 포함). */
export function pruneLocalDrafts(now = Date.now()) {
  try {
    for (const item of draftKeys()) {
      const draft = parse(localStorage.getItem(item));
      if (!draft || !isFresh(draft, now)) localStorage.removeItem(item);
    }
  } catch {
    // 무시
  }
}

export function loadLocalDraft(target: DraftTarget, now = Date.now()): Stored | undefined {
  pruneLocalDrafts(now);
  try {
    return parse(localStorage.getItem(key(target)));
  } catch {
    return undefined;
  }
}

export function saveLocalDraft(target: DraftTarget, values: GuideFormValues) {
  try {
    localStorage.setItem(key(target), JSON.stringify({ ...values, savedAt: Date.now() }));
  } catch {
    // 저장소가 막혀 있으면 화면의 입력만 유지합니다.
  }
}

export function clearLocalDraft(target: DraftTarget) {
  try {
    localStorage.removeItem(key(target));
  } catch {
    // 무시
  }
}

/** 로그아웃할 때 그 사용자가 쓰던 안내를 모두 지웁니다. */
export function clearUserDrafts(userId: string) {
  try {
    for (const item of draftKeys(`${PREFIX}${userId}.`)) localStorage.removeItem(item);
  } catch {
    // 무시
  }
}
