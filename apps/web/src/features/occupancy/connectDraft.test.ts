import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeReturnTo } from "../../lib/returnTo";
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
  vi.stubGlobal("localStorage", memoryStorage());
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
    expect(withReturn).toBe(`${HOME}/connect?returnTo=${guide}`);
  });

  it("keeps the connect URL (with its returnTo) as the Kakao login return path", () => {
    // Given: 팁·메모에서 연결하러 오면 연결 화면 주소에 돌아갈 곳이 붙습니다.
    const tips = `${HOME}/tips`;
    const connect = connectPath(BUILDING, tips);
    // When
    const loginReturn = safeReturnTo(`${connect}&login=cancelled`);
    // Then: 첫 화면(/)으로 떨어지지 않고 같은 연결 화면으로 돌아옵니다.
    expect(loginReturn).toBe(connect);
    expect(new URLSearchParams(connect.split("?")[1]).get("returnTo")).toBe(tips);
    expect(resolveConnectReturnTo(tips, BUILDING)).toBe(tips);
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

  it("forgets the code after 10 minutes", () => {
    // Given
    saveConnectDraft(DRAFT, 0);
    // When
    const kept = loadConnectDraft(BUILDING, 10 * 60 * 1000 - 1);
    const loaded = loadConnectDraft(BUILDING, 10 * 60 * 1000);
    // Then
    expect(kept).toMatchObject(DRAFT);
    expect(loaded).toBeUndefined();
    expect(localStorage.getItem("wh.connect")).toBeNull();
  });

  it("survives coming back from Kakao in a new tab (not tab-only storage)", () => {
    // Given
    saveConnectDraft(DRAFT, 1_000);
    // When: 안드로이드에서 카카오톡 로그인 뒤 새 탭으로 돌아오면 sessionStorage는 비어 있습니다.
    vi.stubGlobal("sessionStorage", memoryStorage());
    // Then
    expect(loadConnectDraft(BUILDING, 2_000)).toMatchObject(DRAFT);
  });

  it("ignores broken values and a stored returnTo that points elsewhere", () => {
    // Given
    localStorage.setItem("wh.connect", "{not json");
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
