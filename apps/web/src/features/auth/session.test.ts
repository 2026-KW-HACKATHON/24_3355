import { describe, expect, it } from "vitest";
import { readInviteHash } from "../invites/token";
import { kakaoStartUrl, readLoginResult, safeReturnTo } from "./session";

describe("return path after login", () => {
  it("keeps a same-site path", () => {
    expect(safeReturnTo("/manage/5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01")).toBe(
      "/manage/5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01",
    );
  });

  it("refuses other sites and fragments", () => {
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo("/invite#t=secret")).toBe("/");
    expect(safeReturnTo("/\\evil.example")).toBe("/");
  });

  it("drops the previous login result so a retry starts clean", () => {
    expect(safeReturnTo("/manage?login=cancelled")).toBe("/manage");
    expect(safeReturnTo("/manage?tab=a&login=failed")).toBe("/manage?tab=a");
  });

  it("encodes the path into the Kakao start URL", () => {
    expect(kakaoStartUrl("/manage?tab=a")).toBe(
      "/api/auth/kakao/start?returnTo=%2Fmanage%3Ftab%3Da",
    );
  });

  it("reads only the known login results", () => {
    expect(readLoginResult("?login=cancelled")).toBe("cancelled");
    expect(readLoginResult("?login=failed")).toBe("failed");
    expect(readLoginResult("?login=other")).toBeUndefined();
    expect(readLoginResult("")).toBeUndefined();
  });
});

describe("invite token in the fragment", () => {
  it("reads #t= and ignores anything else", () => {
    expect(readInviteHash("#t=abcDEF123_-")).toBe("abcDEF123_-");
    expect(readInviteHash("#x=1")).toBeUndefined();
    expect(readInviteHash("#t=")).toBeUndefined();
    expect(readInviteHash("")).toBeUndefined();
  });
});
