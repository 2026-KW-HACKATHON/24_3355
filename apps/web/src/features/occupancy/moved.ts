// 이사를 마친 뒤 연결 종료(09)로 넘기는 history state. 새로고침해도 남고, 없으면 내 정보로 돌아갑니다.
export const MOVED_PATH = "/me/moved";

export type MovedState = { buildingId: string; buildingName: string };

export function readMovedState(state: unknown): MovedState | undefined {
  if (typeof state !== "object" || state === null || !("moved" in state)) return undefined;
  const value = (state as { moved: unknown }).moved;
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record["buildingId"] !== "string" || typeof record["buildingName"] !== "string") {
    return undefined;
  }
  return { buildingId: record["buildingId"], buildingName: record["buildingName"] };
}
