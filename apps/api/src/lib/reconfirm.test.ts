import { describe, expect, it } from "vitest";
import { occupancyState } from "./reconfirm.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const requestAt = new Date("2026-09-12T00:00:00+09:00");
const at = (offsetMs: number) => new Date(requestAt.getTime() + offsetMs);

describe("occupancyState", () => {
  it("stays active without a request before the reconfirm time", () => {
    // When
    const state = occupancyState({ status: "active", nextReconfirmAt: requestAt }, at(-1));
    // Then
    expect(state).toEqual({
      status: "active",
      reconfirmRequested: false,
      reconfirmDueAt: at(14 * DAY_MS),
    });
  });

  it("asks to reconfirm from the reconfirm time and keeps writes open for 14 days", () => {
    // When
    const fromStart = occupancyState({ status: "active", nextReconfirmAt: requestAt }, at(0));
    const lastMoment = occupancyState(
      { status: "active", nextReconfirmAt: requestAt },
      at(14 * DAY_MS - 1),
    );
    // Then
    expect(fromStart).toMatchObject({ status: "active", reconfirmRequested: true });
    expect(lastMoment).toMatchObject({ status: "active", reconfirmRequested: true });
  });

  it("becomes reconfirm_needed 14 days after the request without an answer", () => {
    // When
    const state = occupancyState({ status: "active", nextReconfirmAt: requestAt }, at(14 * DAY_MS));
    // Then
    expect(state).toEqual({
      status: "reconfirm_needed",
      reconfirmRequested: true,
      reconfirmDueAt: at(14 * DAY_MS),
    });
  });

  it("keeps a stored reconfirm_needed and never revives an ended occupancy", () => {
    // When
    const stored = occupancyState(
      { status: "reconfirm_needed", nextReconfirmAt: at(30 * DAY_MS) },
      at(0),
    );
    const ended = occupancyState(
      { status: "inactive", nextReconfirmAt: requestAt },
      at(20 * DAY_MS),
    );
    // Then
    expect(stored).toMatchObject({ status: "reconfirm_needed", reconfirmRequested: true });
    expect(ended).toMatchObject({ status: "inactive", reconfirmRequested: false });
  });
});
