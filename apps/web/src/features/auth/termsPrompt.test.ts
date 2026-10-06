import { type Me, TERMS_VERSION } from "@wolgyeham/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testUser } from "../../test/me";
import { memoryStorage } from "../../test/memoryStorage";
import { kakaoStartUrl, startKakaoLogin } from "./session";
import { markTermsAsked, shouldAskTerms, wasTermsAsked } from "./termsPrompt";

function me(user: Partial<Me["user"]> = {}): Me {
  return { user: testUser("user-a", user), managedBuildings: [], occupancy: null };
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("consent at login (16, D-28)", () => {
  it("sends the agreed terms version with the Kakao start", () => {
    expect(kakaoStartUrl("/b/x/connect", TERMS_VERSION)).toBe(
      `/api/auth/kakao/start?returnTo=%2Fb%2Fx%2Fconnect&consent=${TERMS_VERSION}`,
    );
    expect(kakaoStartUrl("/b/x/connect")).not.toContain("consent");
  });

  it("checks the same consent URL before leaving for Kakao", async () => {
    // Given
    const fetchMock = vi.fn(async (_url: string) => new Response(null, { status: 302 }));
    const assign = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { assign } });
    // When
    await startKakaoLogin("/", TERMS_VERSION);
    // Then
    const expected = `/api/auth/kakao/start?returnTo=%2F&consent=${TERMS_VERSION}`;
    expect(fetchMock.mock.calls[0]?.[0]).toBe(expected);
    expect(assign).toHaveBeenCalledWith(expected);
  });
});

describe("asking again when the terms changed", () => {
  it("asks a signed-in person who has not agreed to this version", () => {
    expect(shouldAskTerms(me({ termsUpToDate: false }), "/me", false)).toBe(true);
    expect(shouldAskTerms(me({ termsVersion: null, termsUpToDate: false }), "/", false)).toBe(true);
  });

  it("does not ask signed-out people, up-to-date accounts, or while reading the documents", () => {
    expect(shouldAskTerms(null, "/", false)).toBe(false);
    expect(shouldAskTerms(me(), "/", false)).toBe(false);
    const outdated = me({ termsUpToDate: false });
    expect(shouldAskTerms(outdated, "/terms", false)).toBe(false);
    expect(shouldAskTerms(outdated, "/privacy/", false)).toBe(false);
    expect(shouldAskTerms(outdated, "/demo", false)).toBe(false);
  });

  it("asks once per app run for each account after 나중에", () => {
    // Given
    const outdated = me({ termsUpToDate: false });
    expect(wasTermsAsked(outdated)).toBe(false);
    // When
    markTermsAsked(outdated);
    // Then
    expect(wasTermsAsked(outdated)).toBe(true);
    expect(shouldAskTerms(outdated, "/me", wasTermsAsked(outdated))).toBe(false);
    const other: Me = { ...outdated, user: testUser("user-b", { termsUpToDate: false }) };
    expect(wasTermsAsked(other)).toBe(false);
  });
});
