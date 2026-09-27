// 날짜는 한국 시간으로 보여줍니다. 서버 값은 ISO 문자열입니다.
const monthFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
});
const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});
const fullDateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** "2026년 3월" */
export function formatMonth(iso: string): string {
  return monthFormat.format(new Date(iso));
}

/** "9월 28일" */
export function formatDay(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** "2026년 9월 27일" */
export function formatDate(iso: string): string {
  return fullDateFormat.format(new Date(iso));
}
