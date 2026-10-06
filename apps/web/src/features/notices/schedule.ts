// 공지 올리기(34)의 시작·끝 입력. `<input type="datetime-local">` 값은 기기 시간대의 “YYYY-MM-DDTHH:mm”이고,
// 서버에는 ISO(UTC)로 보냅니다.
const HOUR_MS = 60 * 60 * 1000;
const pad = (value: number) => String(value).padStart(2, "0");

export function toLocalInput(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** 입력값을 ISO로. 비었거나 날짜가 아니면 undefined. */
export function fromLocalInput(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

/** 처음 채워 둘 값: 다음 정시에 시작해 2시간 뒤 끝남. 집주인이 고쳐 씁니다. */
export function defaultSchedule(now: number): { startsAt: string; endsAt: string } {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  const startTime = start.getTime() + HOUR_MS;
  return { startsAt: toLocalInput(startTime), endsAt: toLocalInput(startTime + 2 * HOUR_MS) };
}

export type ScheduleErrors = { startsAt?: string; endsAt?: string };

/** 서버 규칙(contracts CreateNoticeBody)과 같게: 끝은 시작 이후이고 지금보다 뒤. */
export function scheduleErrors(startsAt: string, endsAt: string, now: number): ScheduleErrors {
  const start = fromLocalInput(startsAt);
  const end = fromLocalInput(endsAt);
  const errors: ScheduleErrors = {};
  if (!start) errors.startsAt = "시작하는 날짜와 시각을 골라 주세요";
  if (!end) errors.endsAt = "끝나는 날짜와 시각을 골라 주세요";
  if (start && end) {
    if (Date.parse(end) < Date.parse(start)) errors.endsAt = "끝나는 시각을 시작 뒤로 골라 주세요";
    else if (Date.parse(end) <= now) errors.endsAt = "끝나는 시각이 이미 지났어요";
  }
  return errors;
}
