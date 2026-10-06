import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "../../test/memoryStorage";
import { clearTipDraft, loadTipDraft, saveTipDraft } from "./tipDraft";

const BUILDING = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f03";
const NOW = Date.parse("2026-09-29T03:00:00.000Z");
const NEW = { buildingId: BUILDING, tipId: null };

beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tip draft kept across a re-login (wh.tipDraft)", () => {
  it("fills the same write screen within 30 minutes and never elsewhere", () => {
    // Given
    saveTipDraft(NEW, { category: "parcel", body: "택배는 선반에" }, NOW);
    // Then
    expect(loadTipDraft(NEW, NOW + 29 * 60_000)).toEqual({
      category: "parcel",
      body: "택배는 선반에",
    });
    expect(loadTipDraft(NEW, NOW + 30 * 60_000)).toBeUndefined();
    expect(loadTipDraft({ buildingId: BUILDING, tipId: "tip-1" }, NOW)).toBeUndefined();
    expect(loadTipDraft({ buildingId: "other", tipId: null }, NOW)).toBeUndefined();
  });

  it("is gone after the screen took it, and ignores broken values", () => {
    // Given
    saveTipDraft(NEW, { category: null, body: "겨울엔" }, NOW);
    // When
    clearTipDraft();
    // Then
    expect(loadTipDraft(NEW, NOW)).toBeUndefined();
    sessionStorage.setItem("wh.tipDraft", "{broken");
    expect(loadTipDraft(NEW, NOW)).toBeUndefined();
    sessionStorage.setItem(
      "wh.tipDraft",
      JSON.stringify({ ...NEW, category: "x", body: "", savedAt: NOW }),
    );
    expect(loadTipDraft(NEW, NOW)).toBeUndefined();
  });
});
