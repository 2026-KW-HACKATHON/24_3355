import { describe, expect, it } from "vitest";
import { applySearch, readApplyIds, stillPending } from "./applyMemos";

const A = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f51";
const B = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f52";

describe("memos to apply (25 → 33 → 43)", () => {
  it("round-trips the ids through the address", () => {
    // Given
    const search = applySearch([A, B]);
    // When
    const ids = readApplyIds(search);
    // Then
    expect(search).toBe(`?apply=${A},${B}`);
    expect(ids).toEqual([A, B]);
  });

  it("drops duplicates and values that are not memo ids", () => {
    // Given
    const search = `?apply=${A},${A},not-an-id,&other=1`;
    // When
    const ids = readApplyIds(search);
    // Then
    expect(ids).toEqual([A]);
  });

  it("adds no query when nothing is selected", () => {
    // Given
    const ids: string[] = [];
    // When
    const search = applySearch(ids);
    // Then
    expect(search).toBe("");
  });

  it("keeps only memos that are still waiting (someone else may have resolved one)", () => {
    // Given
    const selected = [A, B];
    const pending = [B];
    // When
    const ids = stillPending(selected, pending);
    // Then
    expect(ids).toEqual([B]);
  });
});
