import { describe, expect, it } from "vitest";
import { defaultSchedule, fromLocalInput, scheduleErrors, toLocalInput } from "./schedule";

describe("notice schedule input", () => {
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

  it("starts the default at the next full hour for two hours", () => {
    // Given
    const now = new Date(2026, 8, 25, 14, 37).getTime(); // 기기 시간 9월 25일 14:37
    // When
    const schedule = defaultSchedule(now);
    // Then
    expect(schedule).toEqual({ startsAt: "2026-09-25T15:00", endsAt: "2026-09-25T17:00" });
  });

  it("asks for an end after the start and in the future", () => {
    // Given
    const now = new Date(2026, 8, 25, 12, 0).getTime();
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
