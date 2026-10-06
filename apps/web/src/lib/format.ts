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

// 공지 기간은 한국 시간(UTC+9, 서머타임 없음)으로 계산합니다. 기기 시간대와 상관없이 같은 날짜를 보여줍니다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function kst(value: string | number) {
  const time = typeof value === "string" ? Date.parse(value) : value;
  const shifted = new Date(time + KST_OFFSET_MS);
  return {
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: WEEKDAYS[shifted.getUTCDay()] ?? "",
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function kstDayNumber(value: string | number): number {
  const time = typeof value === "string" ? Date.parse(value) : value;
  return Math.floor((time + KST_OFFSET_MS) / DAY_MS);
}

/** 한국 날짜로 같은 날인지. “오늘 연결” 같은 문구에 씁니다. */
export function isSameKstDay(a: string | number, b: string | number): boolean {
  return kstDayNumber(a) === kstDayNumber(b);
}

/** "9월 28일(일)" */
export function formatDayWithWeekday(iso: string): string {
  const { month, day, weekday } = kst(iso);
  return `${month}월 ${day}일(${weekday})`;
}

/** "오전 10시", "낮 12시", "오후 6시 30분", "밤 12시"(자정) */
export function formatClock(iso: string): string {
  const { hour, minute } = kst(iso);
  const label =
    hour === 0
      ? "밤 12시"
      : hour < 12
        ? `오전 ${hour}시`
        : hour === 12
          ? "낮 12시"
          : `오후 ${hour - 12}시`;
  return minute > 0 ? `${label} ${minute}분` : label;
}

/** 공지 적용 기간. 같은 날이면 날짜를 한 번만 씁니다(lofi 15). */
export function formatPeriod(startsAt: string, endsAt: string): string {
  const start = `${formatDayWithWeekday(startsAt)} ${formatClock(startsAt)}`;
  if (isSameKstDay(startsAt, endsAt)) return `${start} ~ ${formatClock(endsAt)}`;
  return `${start} ~ ${formatDayWithWeekday(endsAt)} ${formatClock(endsAt)}`;
}

/** 공지 배지(lofi 15 “3일 뒤”): 시작 전이면 남은 날, 진행 중이면 오늘 끝나는지. */
export function noticeTiming(startsAt: string, endsAt: string, now: number): string {
  const today = kstDayNumber(now);
  if (Date.parse(startsAt) > now) {
    const days = kstDayNumber(startsAt) - today;
    if (days <= 0) return "오늘";
    return days === 1 ? "내일" : `${days}일 뒤`;
  }
  return kstDayNumber(endsAt) === today ? "오늘까지" : "진행 중";
}

/** 받침에 맞춘 ‘로/으로’: “새봄하우스로”, “푸른맨션으로”, “달빛마을로”(ㄹ 받침). 한글이 아니면 “(으)로”. */
export function withRo(word: string): string {
  const last = word.trim().at(-1);
  if (!last) return word;
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return `${word}(으)로`;
  const final = code % 28;
  return final === 0 || final === 8 ? `${word}로` : `${word}으로`;
}

/** 받침에 맞춘 ‘와/과’: “햇살빌라와”, “푸른맨션과”. 한글이 아니면 “와(과)”. */
export function withWa(word: string): string {
  const last = word.trim().at(-1);
  if (!last) return word;
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return `${word}와(과)`;
  return code % 28 === 0 ? `${word}와` : `${word}과`;
}
