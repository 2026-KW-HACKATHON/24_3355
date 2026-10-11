// 공지 올리기(34)의 시작·끝 입력. `<input type="datetime-local">` 값은 시간대가 없는 “YYYY-MM-DDTHH:mm”입니다.
// 건물이 모두 한국에 있으므로 기기 시간대와 상관없이 한국 시간(KST, UTC+9, 서머타임 없음)으로 읽고 쓰며,
// 서버에는 ISO(UTC)로 보냅니다.
const HOUR_MS = 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * HOUR_MS;
const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
const pad = (value: number) => String(value).padStart(2, "0");

/** 시각(ms)을 한국 시간의 datetime-local 값으로. */
export function toLocalInput(time: number): string {
  // KST만큼 민 시각의 UTC 필드가 한국 시간의 날짜·시각입니다.
  const kst = new Date(time + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(
    kst.getUTCHours(),
  )}:${pad(kst.getUTCMinutes())}`;
}

/** 한국 시간으로 읽은 입력값을 ISO(UTC)로. 비었거나 없는 날짜·시각이면 undefined. */
export function fromLocalInput(value: string): string | undefined {
  const match = LOCAL_INPUT.exec(value);
  if (!match) return undefined;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const kst = Date.UTC(year, month - 1, day, hour, minute);
  // 2월 30일·25시처럼 넘친 값은 Date.UTC가 다음 날로 넘기므로 되돌려 보아 거릅니다.
  const back = new Date(kst);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day ||
    back.getUTCHours() !== hour ||
    back.getUTCMinutes() !== minute
  ) {
    return undefined;
  }
  return new Date(kst - KST_OFFSET_MS).toISOString();
}

/** 처음 채워 둘 값: 다음 정시(한국 시간)에 시작해 2시간 뒤 끝남. 집주인이 고쳐 씁니다. */
export function defaultSchedule(now: number): { startsAt: string; endsAt: string } {
  // KST는 정시 단위 오프셋이라 UTC 정시가 곧 한국 시간 정시입니다.
  const startTime = Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS;
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
