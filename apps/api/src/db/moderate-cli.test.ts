import { describe, expect, it } from "vitest";
import { formatModerationList, parseModerateArgs, printable } from "./moderate-cli.ts";

const TIP_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f71";

describe("db:moderate arguments", () => {
  it("requires --by with an operator name for hide and restore", () => {
    // Then
    expect(parseModerateArgs(["list"])).toEqual({ action: "list" });
    expect(parseModerateArgs(["--", "hide", TIP_ID, "--by", "김운영", "특정인", "이야기"])).toEqual(
      {
        action: "hide",
        tipId: TIP_ID,
        operator: "김운영",
        reason: "특정인 이야기",
      },
    );
    expect(parseModerateArgs(["restore", TIP_ID, "--by", "김운영"])).toEqual({
      action: "restore",
      tipId: TIP_ID,
      operator: "김운영",
    });
    expect(parseModerateArgs(["hide", TIP_ID, "사유"])).toBeUndefined();
    expect(parseModerateArgs(["restore", TIP_ID])).toBeUndefined();
    expect(parseModerateArgs(["hide", TIP_ID, "--by"])).toBeUndefined();
    expect(parseModerateArgs(["hide", TIP_ID, "--by", "이름\u001b[2J"])).toBeUndefined();
    expect(parseModerateArgs(["hide", "not-a-uuid", "--by", "김운영"])).toBeUndefined();
    expect(parseModerateArgs(["hide", TIP_ID, "--by", "김운영", "사유\u0007"])).toBeUndefined();
  });
});

describe("db:moderate output", () => {
  it("escapes control characters so user text cannot drive the terminal", () => {
    // Then
    expect(printable("안녕\u001b[2J\u0007\n\u009b끝")).toBe("안녕\\u{1b}[2J\\u{7}\\u{a}\\u{9b}끝");
    expect(printable("평범한 글")).toBe("평범한 글");
  });

  it("shows the reported text when the tip changed, and every moderation action", () => {
    // Given
    const createdAt = new Date("2026-09-12T20:10:00+09:00");
    const lines = formatModerationList([
      {
        tip: {
          id: TIP_ID,
          buildingId: TIP_ID,
          authorUserId: null,
          category: "recycling",
          body: "지금 내용\u001b[2J",
          hiddenAt: createdAt,
          hiddenReason: "특정인",
          deletedAt: createdAt,
          createdAt,
          updatedAt: createdAt,
        },
        buildingName: "햇살빌라",
        reports: [
          {
            id: TIP_ID,
            tipId: TIP_ID,
            reporterUserId: null,
            reason: "이상해요",
            tipBody: "신고할 때 내용",
            status: "reviewed",
            reviewedAt: createdAt,
            createdAt,
            updatedAt: createdAt,
          },
        ],
        actions: [
          {
            id: TIP_ID,
            tipId: TIP_ID,
            action: "hide",
            reason: "특정인",
            operator: "김운영",
            createdAt,
            updatedAt: createdAt,
          },
        ],
      },
    ]);
    // Then
    expect(lines.join("\n")).toContain("가림(특정인) · 작성자가 지움");
    expect(lines.join("\n")).toContain("지금 내용: 지금 내용\\u{1b}[2J");
    expect(lines.join("\n")).toContain("신고할 때 내용: 신고할 때 내용");
    expect(lines.join("\n")).toContain("hide · 김운영 · 특정인");
    expect(lines.join("\n")).not.toContain("\u001b");
  });
});
