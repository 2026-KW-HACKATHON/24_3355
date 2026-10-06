// 보낸 직후 접수 화면(06)으로 갈 때 history state에 남기는 표시. 새로고침해도 남고, 확인 링크로 다시 열면 없습니다.
export const REPORT_SENT_STATE = "whReportSent";

export type ReportSent = {
  /** 조회 토큰을 이 브라우저에 저장했는지. false면 확인 링크 보관 안내를 더 크게 보여줍니다. */
  stored: boolean;
};

export function readReportSent(state: unknown): ReportSent | undefined {
  if (typeof state !== "object" || state === null || !(REPORT_SENT_STATE in state))
    return undefined;
  const value = (state as Record<string, unknown>)[REPORT_SENT_STATE];
  if (typeof value !== "object" || value === null) return undefined;
  const stored = (value as Record<string, unknown>)["stored"];
  return { stored: stored !== false };
}
