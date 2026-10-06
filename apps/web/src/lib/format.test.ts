import { describe, expect, it } from "vitest";
import { formatClock, formatPeriod, isSameKstDay, noticeTiming, withRo } from "./format";

// 2026-09-28 10:00 KST = 01:00 UTC
const SEP28_10 = "2026-09-28T01:00:00.000Z";
const SEP28_12 = "2026-09-28T03:00:00.000Z";
const SEP29_1830 = "2026-09-29T09:30:00.000Z";

describe("notice period", () => {
  it("writes the date once for a same-day period", () => {
    // Given
    const [start, end] = [SEP28_10, SEP28_12];
    // When
    const text = formatPeriod(start, end);
    // Then
    expect(text).toBe("9월 28일(월) 오전 10시 ~ 낮 12시");
  });

  it("writes both dates when the period spans days", () => {
    // Given
    const [start, end] = [SEP28_10, SEP29_1830];
    // When
    const text = formatPeriod(start, end);
    // Then
    expect(text).toBe("9월 28일(월) 오전 10시 ~ 9월 29일(화) 오후 6시 30분");
  });

  it("names midnight and noon without 오전·오후 ambiguity", () => {
    // Given
    const midnight = "2026-09-27T15:00:00.000Z"; // 9월 28일 0시 KST
    // When
    const text = [formatClock(midnight), formatClock(SEP28_12)];
    // Then
    expect(text).toEqual(["밤 12시", "낮 12시"]);
  });

  it("uses the Korean calendar day regardless of the device time zone", () => {
    // Given
    const lateUtc = "2026-09-27T16:00:00.000Z"; // 9월 28일 1시 KST
    // When
    const same = isSameKstDay(lateUtc, SEP28_10);
    // Then
    expect(same).toBe(true);
  });
});

describe("notice timing badge", () => {
  const now = Date.parse("2026-09-25T03:00:00.000Z"); // 9월 25일 낮 12시 KST

  it("counts days until the start", () => {
    // Given
    const cases = [
      ["2026-09-25T08:00:00.000Z", "2026-09-25T09:00:00.000Z"], // 오늘 오후
      ["2026-09-26T01:00:00.000Z", "2026-09-26T03:00:00.000Z"], // 내일
      [SEP28_10, SEP28_12], // 3일 뒤
    ] as const;
    // When
    const labels = cases.map(([start, end]) => noticeTiming(start, end, now));
    // Then
    expect(labels).toEqual(["오늘", "내일", "3일 뒤"]);
  });

  it("says whether an ongoing notice ends today", () => {
    // Given
    const endsToday = ["2026-09-24T01:00:00.000Z", "2026-09-25T10:00:00.000Z"] as const;
    const endsLater = ["2026-09-24T01:00:00.000Z", SEP28_12] as const;
    // When
    const labels = [noticeTiming(...endsToday, now), noticeTiming(...endsLater, now)];
    // Then
    expect(labels).toEqual(["오늘까지", "진행 중"]);
  });
});

describe("building name particle", () => {
  it("picks 로 or 으로 by the last syllable", () => {
    // Given
    const names = ["새봄하우스", "푸른맨션", "달빛마을", "Tower 2"];
    // When
    const results = names.map(withRo);
    // Then
    expect(results).toEqual(["새봄하우스로", "푸른맨션으로", "달빛마을로", "Tower 2(으)로"]);
  });
});
