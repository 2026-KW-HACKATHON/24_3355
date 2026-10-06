import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "../../test/memoryStorage";
import { markReconfirmAsked, reconfirmState, wasReconfirmAsked } from "./reconfirm";

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reconfirm banner (40)", () => {
  it("shows nothing for a settled connection or no connection", () => {
    // Given
    const settled = { status: "active" as const, reconfirmRequested: false };
    // When
    const states = [reconfirmState(settled), reconfirmState(null)];
    // Then
    expect(states).toEqual(["none", "none"]);
  });

  it("asks while the request is open and keeps writing allowed", () => {
    // Given
    const requested = { status: "active" as const, reconfirmRequested: true };
    // When
    const state = reconfirmState(requested);
    // Then
    expect(state).toBe("requested");
  });

  it("treats reconfirm_needed as needed even if the flag is set", () => {
    // Given
    const needed = { status: "reconfirm_needed" as const, reconfirmRequested: true };
    // When
    const state = reconfirmState(needed);
    // Then
    expect(state).toBe("needed");
  });

  it("opens the sheet by itself at most once a day (Korea date) per request", () => {
    // Given
    const occupancy = { id: "occ-1", nextReconfirmAt: "2026-09-01T00:00:00.000Z" };
    const morning = Date.parse("2026-09-29T00:30:00.000Z"); // 9월 29일 오전 9:30 (KST)
    const night = Date.parse("2026-09-29T14:30:00.000Z"); // 9월 29일 밤 11:30 (KST)
    const nextDay = Date.parse("2026-09-29T15:30:00.000Z"); // 9월 30일 오전 0:30 (KST)
    const before = wasReconfirmAsked(occupancy, morning);
    // When
    markReconfirmAsked(occupancy, morning);
    // Then
    expect(before).toBe(false);
    expect(wasReconfirmAsked(occupancy, night)).toBe(true);
    expect(wasReconfirmAsked(occupancy, nextDay)).toBe(false);
    expect(
      wasReconfirmAsked({ ...occupancy, nextReconfirmAt: "2027-09-01T00:00:00.000Z" }, night),
    ).toBe(false);
  });
});
