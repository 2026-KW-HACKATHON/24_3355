import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "../../test/memoryStorage";
import {
  clearUserDrafts,
  type DraftTarget,
  LOCAL_DRAFT_MAX_AGE_MS,
  loadLocalDraft,
  saveLocalDraft,
} from "./localDraft";

const BUILDING = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
const ALICE: DraftTarget = { userId: "user-a", buildingId: BUILDING, guideId: undefined };
const BOB: DraftTarget = { userId: "user-b", buildingId: BUILDING, guideId: undefined };
const VALUES = { category: "recycling", title: "분리수거", body: "화요일 저녁" } as const;

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("local guide drafts", () => {
  it("keeps drafts apart for each user on the same device", () => {
    // Given
    saveLocalDraft(ALICE, VALUES);
    // When
    const mine = loadLocalDraft(ALICE);
    const theirs = loadLocalDraft(BOB);
    // Then
    expect(mine).toMatchObject(VALUES);
    expect(typeof mine?.savedAt).toBe("number");
    expect(theirs).toBeUndefined();
    expect(localStorage.getItem(`wh.guideDraft.user-a.${BUILDING}.new`)).not.toBeNull();
  });

  it("drops a draft older than 7 days", () => {
    // Given
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
    saveLocalDraft(ALICE, VALUES);
    saveLocalDraft(BOB, VALUES);
    const later = Date.now() + LOCAL_DRAFT_MAX_AGE_MS + 1;
    // When
    const draft = loadLocalDraft(ALICE, later);
    // Then
    expect(draft).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });

  it("keeps a draft up to 7 days old", () => {
    // Given
    saveLocalDraft(ALICE, VALUES);
    // When
    const draft = loadLocalDraft(ALICE, Date.now() + LOCAL_DRAFT_MAX_AGE_MS);
    // Then
    expect(draft).toMatchObject(VALUES);
  });

  it("clears only the signed-out user's drafts", () => {
    // Given
    saveLocalDraft(ALICE, VALUES);
    saveLocalDraft({ ...ALICE, guideId: "guide-1" }, VALUES);
    saveLocalDraft(BOB, VALUES);
    localStorage.setItem("wh.size", "large");
    // When
    clearUserDrafts("user-a");
    // Then
    expect(loadLocalDraft(ALICE)).toBeUndefined();
    expect(loadLocalDraft({ ...ALICE, guideId: "guide-1" })).toBeUndefined();
    expect(loadLocalDraft(BOB)).toMatchObject(VALUES);
    expect(localStorage.getItem("wh.size")).toBe("large");
  });

  it("does nothing when storage is blocked", () => {
    // Given
    vi.stubGlobal("localStorage", undefined);
    // When
    const run = () => {
      saveLocalDraft(ALICE, VALUES);
      clearUserDrafts("user-a");
      return loadLocalDraft(ALICE);
    };
    // Then
    expect(run).not.toThrow();
    expect(run()).toBeUndefined();
  });
});
