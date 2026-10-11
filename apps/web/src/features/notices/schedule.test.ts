import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultSchedule, fromLocalInput, scheduleErrors, toLocalInput } from "./schedule";

describe("notice schedule input", () => {
  // 기기 시간대가 한국이 아니어도(여기서는 UTC) 한국 시간으로 읽고 쓰는지 봅니다.
  const originalTz = process.env["TZ"];
  beforeAll(() => {
    process.env["TZ"] = "UTC";
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env["TZ"];
    else process.env["TZ"] = originalTz;
  });

  it("reads a datetime-local value as Korean time regardless of the device time zone", () => {
    // Given: 기기 시간대가 UTC
    expect(new Date(0).getTimezoneOffset()).toBe(0);
    // When
    const iso = fromLocalInput("2026-09-28T10:00");
    // Then: 한국 시간 10:00 = UTC 01:00
    expect(iso).toBe("2026-09-28T01:00:00.000Z");
    expect(toLocalInput(Date.parse("2026-09-28T01:00:00.000Z"))).toBe("2026-09-28T10:00");
    // 한국 시간 자정 넘김: UTC 9월 27일 15:00 = 한국 9월 28일 00:00
    expect(toLocalInput(Date.parse("2026-09-27T15:00:00.000Z"))).toBe("2026-09-28T00:00");
  });

  it("rejects dates and times that do not exist", () => {
    // When
    const results = ["2026-02-30T10:00", "2026-09-28T24:00", "2026-13-01T10:00"].map(
      fromLocalInput,
    );
    // Then
    expect(results).toEqual([undefined, undefined, undefined]);
  });

  it("round-trips a datetime-local value through ISO", () => {
    // Given
    const value = "2026-09-28T10:00";
    // When
    const iso = fromLocalInput(value);
    // Then
    expect(iso).toBeDefined();
    expect(toLocalInput(Date.parse(iso ?? ""))).toBe(value);
  });

  it("rejects empty or partial values", () => {
    // Given
    const values = ["", "2026-09-28", "not a date"];
    // When
    const results = values.map(fromLocalInput);
    // Then
    expect(results).toEqual([undefined, undefined, undefined]);
  });

  it("starts the default at the next full hour (Korean time) for two hours", () => {
    // Given
    const now = Date.parse("2026-09-25T14:37:00+09:00"); // 한국 시간 9월 25일 14:37
    // When
    const schedule = defaultSchedule(now);
    // Then
    expect(schedule).toEqual({ startsAt: "2026-09-25T15:00", endsAt: "2026-09-25T17:00" });
  });

  it("asks for an end after the start and in the future", () => {
    // Given
    const now = Date.parse("2026-09-25T12:00:00+09:00");
    // When
    const reversed = scheduleErrors("2026-09-28T12:00", "2026-09-28T10:00", now);
    const past = scheduleErrors("2026-09-20T10:00", "2026-09-21T10:00", now);
    const missing = scheduleErrors("", "2026-09-28T10:00", now);
    const ok = scheduleErrors("2026-09-28T10:00", "2026-09-28T12:00", now);
    // Then
    expect(reversed.endsAt).toBeDefined();
    expect(past.endsAt).toBeDefined();
    expect(missing.startsAt).toBeDefined();
    expect(ok).toEqual({});
  });
});
