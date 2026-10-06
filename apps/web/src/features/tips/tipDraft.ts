import { TIP_CATEGORIES, type TipCategory } from "@wolgyeham/contracts";

// 쓰던 생활 팁(19). 로그인이 끝나(401) 다시 로그인하러 갈 때만 이 탭에(sessionStorage) 잠깐 둡니다.
// 돌아오면 같은 건물·같은 팁(새로 쓰기면 null)의 작성 화면에 채우고, 자동으로 보내지 않습니다(frontend.md §5).
const KEY = "wh.tipDraft";
const TTL_MS = 30 * 60 * 1000;

export type TipDraft = { category: TipCategory | null; body: string };
type Stored = TipDraft & { buildingId: string; tipId: string | null; savedAt: number };

function isStored(value: unknown): value is Stored {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["buildingId"] === "string" &&
    (typeof v["tipId"] === "string" || v["tipId"] === null) &&
    (v["category"] === null || TIP_CATEGORIES.includes(v["category"] as TipCategory)) &&
    typeof v["body"] === "string" &&
    typeof v["savedAt"] === "number"
  );
}

export function saveTipDraft(
  where: { buildingId: string; tipId: string | null },
  draft: TipDraft,
  now = Date.now(),
) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...where, ...draft, savedAt: now }));
  } catch {
    // 저장하지 못하면 돌아와서 다시 써야 합니다.
  }
}

/** 같은 건물·같은 팁에서 30분 안에 남긴 것. 읽기만 하고 지우지 않습니다(화면이 채운 뒤 clearTipDraft). */
export function loadTipDraft(
  where: { buildingId: string; tipId: string | null },
  now = Date.now(),
): TipDraft | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {
    return undefined;
  }
  if (!isStored(parsed)) return undefined;
  if (parsed.buildingId !== where.buildingId || parsed.tipId !== where.tipId) return undefined;
  if (now - parsed.savedAt >= TTL_MS || parsed.savedAt > now) return undefined;
  return { category: parsed.category, body: parsed.body };
}

export function clearTipDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
