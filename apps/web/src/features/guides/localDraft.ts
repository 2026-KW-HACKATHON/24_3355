import { GUIDE_CATEGORIES, type GuideCategory } from "@wolgyeham/contracts";

// 쓰는 중인 안내를 이 기기에 따로 둡니다(lofi 33 “쓰는 중인 내용은 따로 저장돼요”).
// 서버 초안(draft)은 ‘미리 보기’를 누를 때 저장합니다. 저장이 막힌 브라우저에서는 아무것도 하지 않습니다.
export type GuideFormValues = { category: GuideCategory; title: string; body: string };
type Stored = GuideFormValues & { savedAt: number };

const key = (buildingId: string, guideId: string | undefined) =>
  `wh.guideDraft.${buildingId}.${guideId ?? "new"}`;

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

export function loadLocalDraft(
  buildingId: string,
  guideId: string | undefined,
): Stored | undefined {
  try {
    const raw = localStorage.getItem(key(buildingId, guideId));
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isStored(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function saveLocalDraft(
  buildingId: string,
  guideId: string | undefined,
  values: GuideFormValues,
) {
  try {
    localStorage.setItem(
      key(buildingId, guideId),
      JSON.stringify({ ...values, savedAt: Date.now() }),
    );
  } catch {
    // 저장소가 막혀 있으면 화면의 입력만 유지합니다.
  }
}

export function clearLocalDraft(buildingId: string, guideId: string | undefined) {
  try {
    localStorage.removeItem(key(buildingId, guideId));
  } catch {
    // 무시
  }
}
