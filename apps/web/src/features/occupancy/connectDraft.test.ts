import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "../../test/memoryStorage";
import {
  clearConnectDraft,
  connectPath,
  loadConnectDraft,
  resolveConnectReturnTo,
  saveConnectDraft,
} from "./connectDraft";

const BUILDING = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
const OTHER = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f02";
const HOME = `/b/${BUILDING}`;
const DRAFT = { buildingId: BUILDING, buildingName: "햇살빌라", code: "WK72P4", returnTo: HOME };

beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connect return path", () => {
  it("returns to a screen of the same building", () => {
    // Given
    const guide = `${HOME}/guides/5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f11`;
    // When
    const result = resolveConnectReturnTo(guide, BUILDING);
    // Then
    expect(result).toBe(guide);
  });

  it("falls back to the building home for other buildings, other sites or the connect screen", () => {
    // Given
    const values = [
      null,
      "",
      `/b/${OTHER}`,
      "/manage",
      "https://evil.example",
      "//evil.example",
      `${HOME}/connect`,
      `${HOME}x`,
    ];
    // When
    const results = values.map((value) => resolveConnectReturnTo(value, BUILDING));
    // Then
    expect(results).toEqual(values.map(() => HOME));
  });

  it("drops the Kakao login result from the path", () => {
    // Given
    const value = `${HOME}/first?login=cancelled`;
    // When
    const result = resolveConnectReturnTo(value, BUILDING);
    // Then
    expect(result).toBe(`${HOME}/first`);
  });

  it("adds returnTo to the connect URL only when it is not the building home", () => {
    // Given
    const guide = `${HOME}/guides/5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f11`;
    // When
    const plain = connectPath(BUILDING);
    const withReturn = connectPath(BUILDING, guide);
    // Then
    expect(plain).toBe(`${HOME}/connect`);
    expect(withReturn).toBe(`${HOME}/connect?returnTo=${encodeURIComponent(guide)}`);
  });
});

describe("connect draft", () => {
  it("keeps the checked code for the same building across the login redirect", () => {
    // Given
    saveConnectDraft(DRAFT, 1_000);
    // When
    const loaded = loadConnectDraft(BUILDING, 2_000);
    // Then
    expect(loaded).toMatchObject(DRAFT);
  });

  it("does not hand the code to another building", () => {
    // Given
    saveConnectDraft(DRAFT, 1_000);
    // When
    const loaded = loadConnectDraft(OTHER, 2_000);
    // Then
    expect(loaded).toBeUndefined();
  });

  it("forgets the code after 30 minutes", () => {
    // Given
    saveConnectDraft(DRAFT, 0);
    // When
    const loaded = loadConnectDraft(BUILDING, 30 * 60 * 1000);
    // Then
    expect(loaded).toBeUndefined();
    expect(sessionStorage.getItem("wh.connect")).toBeNull();
  });

  it("ignores broken values and a stored returnTo that points elsewhere", () => {
    // Given
    sessionStorage.setItem("wh.connect", "{not json");
    const broken = loadConnectDraft(BUILDING, 1_000);
    saveConnectDraft({ ...DRAFT, returnTo: "https://evil.example" }, 1_000);
    // When
    const redirected = loadConnectDraft(BUILDING, 2_000);
    // Then
    expect(broken).toBeUndefined();
    expect(redirected?.returnTo).toBe(HOME);
  });

  it("clears the draft", () => {
    // Given
    saveConnectDraft(DRAFT, 1_000);
    // When
    clearConnectDraft();
    // Then
    expect(loadConnectDraft(BUILDING, 2_000)).toBeUndefined();
  });
});
