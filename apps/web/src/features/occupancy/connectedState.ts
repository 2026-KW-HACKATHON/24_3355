// 연결을 마친 뒤 돌아간 화면에 남기는 history state. 새로고침해도 남고, 다른 화면으로 가면 사라집니다.
// 거주자 홈은 이것으로 환영 카드(10)를, 앱 틀은 알림 선택 시트(17)를 한 번만 보여줍니다.
export type ConnectedState = {
  buildingId: string;
  buildingName: string;
  /** 새로 연결했는지. 이미 연결돼 있던 건물이면 false라 환영·알림 선택을 띄우지 않습니다. */
  first: boolean;
  /** 알림 선택 시트를 이미 닫았는지. */
  notifyAsked?: boolean;
};

export function readConnectedState(state: unknown): ConnectedState | undefined {
  if (typeof state !== "object" || state === null || !("connected" in state)) return undefined;
  const value = (state as { connected: unknown }).connected;
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record["buildingId"] !== "string" ||
    typeof record["buildingName"] !== "string" ||
    typeof record["first"] !== "boolean"
  ) {
    return undefined;
  }
  return {
    buildingId: record["buildingId"],
    buildingName: record["buildingName"],
    first: record["first"],
    notifyAsked: record["notifyAsked"] === true,
  };
}
