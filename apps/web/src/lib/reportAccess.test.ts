import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "../test/memoryStorage";
import {
  findReportAccess,
  keepLinkToken,
  loadReportAccess,
  readReportHash,
  removeReportAccess,
  reportLink,
  reportPath,
  saveReportAccess,
} from "./reportAccess";

const A = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
const B = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f03";
const NOW = Date.parse("2026-09-29T03:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function report(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("report access storage (wh.reportAccess)", () => {
  it("keeps tokens per building", () => {
    // Given
    saveReportAccess({ reportId: report(1), buildingId: A, token: "token-a-1" }, NOW);
    saveReportAccess({ reportId: report(2), buildingId: B, token: "token-b-1" }, NOW);
    // When
    const forA = loadReportAccess(A, NOW);
    const forB = loadReportAccess(B, NOW);
    // Then
    expect(forA.map((item) => item.token)).toEqual(["token-a-1"]);
    expect(forB.map((item) => item.token)).toEqual(["token-b-1"]);
    expect(findReportAccess(report(2), NOW)?.buildingId).toBe(B);
  });

  it("uses the server expiry and drops expired tokens when reading", () => {
    // Given
    saveReportAccess(
      {
        reportId: report(1),
        buildingId: A,
        token: "soon",
        expiresAt: new Date(NOW + DAY).toISOString(),
      },
      NOW,
    );
    saveReportAccess({ reportId: report(2), buildingId: A, token: "later" }, NOW);
    // When
    const tomorrow = loadReportAccess(A, NOW + 2 * DAY);
    const afterMonth = loadReportAccess(A, NOW + 31 * DAY);
    // Then
    expect(tomorrow.map((item) => item.token)).toEqual(["later"]);
    expect(afterMonth).toEqual([]);
  });

  it("overwrites the same report and keeps at most 20 per building", () => {
    // Given
    for (let n = 1; n <= 22; n += 1) {
      saveReportAccess({ reportId: report(n), buildingId: A, token: `t-${n}` }, NOW + n);
    }
    saveReportAccess({ reportId: report(22), buildingId: A, token: "t-22-again" }, NOW + 30);
    saveReportAccess({ reportId: report(99), buildingId: B, token: "other" }, NOW + 31);
    // When
    const tokens = loadReportAccess(A, NOW + 40).map((item) => item.token);
    // Then
    expect(tokens).toHaveLength(20);
    expect(tokens).not.toContain("t-1");
    expect(tokens).not.toContain("t-2");
    expect(tokens.at(-1)).toBe("t-22-again");
    expect(loadReportAccess(B, NOW + 40)).toHaveLength(1);
  });

  it("removes tokens the server no longer knows", () => {
    // Given
    saveReportAccess({ reportId: report(1), buildingId: A, token: "gone" }, NOW);
    saveReportAccess({ reportId: report(2), buildingId: A, token: "alive" }, NOW);
    // When
    removeReportAccess(["gone"], NOW);
    // Then
    expect(loadReportAccess(A, NOW).map((item) => item.token)).toEqual(["alive"]);
  });

  it("reports failure instead of throwing when storage is blocked", () => {
    // Given
    const blocked = memoryStorage();
    blocked.setItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.stubGlobal("localStorage", blocked);
    // When
    const saved = saveReportAccess({ reportId: report(1), buildingId: A, token: "x" }, NOW);
    // Then
    expect(saved).toBe(false);
    expect(loadReportAccess(A, NOW)).toEqual([]);
  });

  it("ignores broken stored values", () => {
    // Given
    localStorage.setItem("wh.reportAccess", "{not json");
    // When
    const list = loadReportAccess(undefined, NOW);
    // Then
    expect(list).toEqual([]);
  });
});

describe("keeping the link token before clearing #t= (LF-11)", () => {
  const reporter = (n: number) => ({
    id: report(n),
    buildingId: B,
    viewer: "reporter",
    accessExpiresAt: new Date(NOW + 30 * DAY).toISOString(),
  });

  it("clears the address only once this browser keeps the token", () => {
    // Given: 이 브라우저에서 보낸 직후라 이미 저장돼 있음
    saveReportAccess({ reportId: report(1), buildingId: B, token: "sent-here" }, NOW);
    // Then
    expect(keepLinkToken(report(1), "sent-here", undefined, NOW)).toBe(true);
    // 다른 브라우저에서 연 링크는 보낸 사람으로 확인된 뒤에 저장
    expect(keepLinkToken(report(2), "opened-here", undefined, NOW)).toBe(false);
    expect(keepLinkToken(report(2), "opened-here", reporter(2), NOW)).toBe(true);
    expect(findReportAccess(report(2), NOW)?.token).toBe("opened-here");
  });

  it("keeps #t= when the token cannot be stored or the viewer is not the reporter", () => {
    // Given
    expect(keepLinkToken(report(3), "x", { ...reporter(3), viewer: "manager" }, NOW)).toBe(false);
    expect(keepLinkToken(report(3), "x", { ...reporter(3), accessExpiresAt: null }, NOW)).toBe(
      false,
    );
    const blocked = memoryStorage();
    blocked.setItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.stubGlobal("localStorage", blocked);
    // Then: 비공개 모드
    expect(keepLinkToken(report(4), "private", reporter(4), NOW)).toBe(false);
  });
});

describe("confirmation link", () => {
  it("keeps the token after # only", () => {
    // Given
    const token = "abc_DEF-123";
    // When
    const path = reportPath(report(7), token);
    const link = reportLink(report(7), token, "https://wolgyeham.example");
    // Then
    expect(path).toBe(`/r/${report(7)}#t=${token}`);
    expect(path).not.toContain("?");
    expect(link).toBe(`https://wolgyeham.example/r/${report(7)}#t=${token}`);
    expect(reportPath(report(7))).toBe(`/r/${report(7)}`);
  });

  it("reads the token back from the hash", () => {
    expect(readReportHash("#t=abc_DEF-123")).toBe("abc_DEF-123");
    expect(readReportHash("t=only")).toBe("only");
    expect(readReportHash("#t=")).toBeUndefined();
    expect(readReportHash("")).toBeUndefined();
    expect(readReportHash("#other=1")).toBeUndefined();
  });
});
