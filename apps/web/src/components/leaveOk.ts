// 나가기 확인을 건너뛰는 표시. 대화상자(SEED Dialog)를 쓰지 않는 화면·시트도 가져다 쓰므로
// LeaveConfirm과 따로 둡니다(공개 화면 번들에 Dialog가 딸려 오지 않게).

/** 보내기에 성공해 이동할 때 navigate state에 넣으면 확인 없이 떠납니다. */
export const LEAVE_OK = { whLeaveOk: true } as const;

export function isLeaveOk(state: unknown): boolean {
  return typeof state === "object" && state !== null && "whLeaveOk" in state;
}
