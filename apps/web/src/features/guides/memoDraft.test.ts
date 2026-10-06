import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "../../test/memoryStorage";
import { memoReturnAction, memoWritePath, saveMemoDraft, takeMemoDraft } from "./memoDraft";

const GUIDE = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f11";

beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("memo kept across a login (12)", () => {
  it("gives the text back once for the same guide", () => {
    // Given
    saveMemoDraft(GUIDE, "재활용 수거일이 바뀌었어요", 1_000);
    // When
    const first = takeMemoDraft(GUIDE, 2_000);
    const second = takeMemoDraft(GUIDE, 3_000);
    // Then
    expect(first).toBe("재활용 수거일이 바뀌었어요");
    expect(second).toBeUndefined();
  });

  it("does not fill another guide or an old draft", () => {
    // Given
    saveMemoDraft(GUIDE, "메모", 0);
    // When
    const other = takeMemoDraft("5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f12", 1_000);
    const old = takeMemoDraft(GUIDE, 31 * 60 * 1000);
    // Then
    expect(other).toBeUndefined();
    expect(old).toBeUndefined();
  });

  it("returns to the guide with the sheet open, never sending on its own", () => {
    // Given
    const building = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
    // When
    const path = memoWritePath(building, GUIDE);
    // Then
    expect(path).toBe(`/b/${building}/guides/${GUIDE}?memo=write`);
  });
});

describe("coming back with ?memo=write", () => {
  const base = { wantsWrite: true, meKnown: true, notifyPending: false, canWrite: true };

  it("waits while my info is loading or failed, so a connected resident keeps the memo", () => {
    expect(memoReturnAction({ ...base, meKnown: false })).toBe("wait");
    expect(memoReturnAction({ ...base, meKnown: false, canWrite: false })).toBe("wait");
    expect(memoReturnAction({ ...base, notifyPending: true })).toBe("wait");
  });

  it("opens the sheet for a resident and drops the draft only when writing is not allowed", () => {
    expect(memoReturnAction(base)).toBe("open");
    expect(memoReturnAction({ ...base, canWrite: false })).toBe("drop");
    expect(memoReturnAction({ ...base, wantsWrite: false })).toBe("none");
  });
});
