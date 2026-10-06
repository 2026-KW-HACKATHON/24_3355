import type { Occupancy } from "@wolgyeham/contracts";
import { isSameKstDay } from "../../lib/format";

// 재확인(LF-09, 40). 서버가 읽을 때 계산한 값(D-13)만 보고 나눕니다.
// - requested: 확인 요청 중(아직 active). 쓰기·알림은 그대로이고 기한 안에 답하면 됩니다.
// - needed: 기한이 지나 reconfirm_needed. 새 글쓰기와 공지 알림이 멈추고 읽기는 그대로입니다.
export type ReconfirmState = "none" | "requested" | "needed";

type OccupancyLike = Pick<Occupancy, "status" | "reconfirmRequested"> | null | undefined;

export function reconfirmState(occupancy: OccupancyLike): ReconfirmState {
  if (!occupancy) return "none";
  if (occupancy.status === "reconfirm_needed") return "needed";
  return occupancy.reconfirmRequested ? "requested" : "none";
}

// 시트(40)는 하루(한국 날짜)에 한 번만 먼저 띄웁니다. 닫아도 홈 위 배너와 내 정보에서 다시 열 수 있습니다.
// 연결 id와 다음 확인 시각이 같을 때만 같은 요청으로 봅니다(‘아직 살아요’ 뒤 새 요청은 다시 물음).
const ASKED_KEY = "wh.reconfirmAsked";

type AskTarget = Pick<Occupancy, "id" | "nextReconfirmAt">;

const askedValue = (occupancy: AskTarget) => `${occupancy.id}:${occupancy.nextReconfirmAt}`;

export function wasReconfirmAsked(occupancy: AskTarget, now = Date.now()): boolean {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(ASKED_KEY) ?? "null");
    if (typeof saved !== "object" || saved === null) return false;
    const { value, at } = saved as Record<string, unknown>;
    return value === askedValue(occupancy) && typeof at === "number" && isSameKstDay(at, now);
  } catch {
    return false; // 비공개 모드·저장소 차단·깨진 값
  }
}

export function markReconfirmAsked(occupancy: AskTarget, now = Date.now()) {
  try {
    localStorage.setItem(ASKED_KEY, JSON.stringify({ value: askedValue(occupancy), at: now }));
  } catch {
    // 저장하지 못하면 다음에 홈을 열 때 한 번 더 물어봅니다.
  }
}
