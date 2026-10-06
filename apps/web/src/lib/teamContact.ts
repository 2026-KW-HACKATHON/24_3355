/**
 * 월계함 팀에 연락할 곳(`VITE_TEAM_CONTACT_URL`, 예: 오픈채팅·문의 폼 https 주소나 mailto:).
 * 건물 확인(23)의 ‘팀에 알리기’와 약관·개인정보 처리방침의 문의에 씁니다. 값이 없거나
 * http(s)·mailto 주소가 아니면 undefined라서 링크를 숨깁니다.
 */
export function teamContactUrl(
  configured: string | undefined = import.meta.env["VITE_TEAM_CONTACT_URL"],
): string | undefined {
  if (!configured) return undefined;
  try {
    const url = new URL(configured.trim());
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
