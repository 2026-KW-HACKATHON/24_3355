import { describe, expect, it } from "vitest";
import { maskSensitive, unmask } from "./mask.ts";

describe("maskSensitive", () => {
  it("hides phone numbers, emails and account-like digit runs and restores them", () => {
    // Given
    const text = [
      "보일러 고장은 010-1234-5678로 연락 주세요. 사무실 02-987-6543, 대표 1588-1234",
      "월세 계좌: 국민 123456-01-234567 (홍길동)",
      "메일 owner.kim+villa@example.co.kr",
      "302호 택배함 1234번, 수거일 2026-10-16 오전 7시",
      "다시 한 번: 010-1234-5678",
    ].join("\n");
    // When
    const masked = maskSensitive(text);
    // Then: 가린 글에는 원래 값이 없고, 짧은 숫자·날짜는 남습니다
    expect(masked.text).not.toMatch(/010-1234-5678|02-987-6543|1588-1234|123456-01-234567|example/);
    expect(masked.text).toContain("1234번");
    expect(masked.text).toContain("2026-10-16");
    expect(masked.text).toContain("[[P1]]로 연락");
    expect(masked.text).toContain("다시 한 번: [[P1]]");
    expect(masked.values.size).toBe(5);
    // 되돌리면 원문과 같습니다
    const used = new Set<string>();
    expect(unmask(masked.text, masked.values, used)).toBe(text);
    expect(used.size).toBe(5);
  });

  it("handles +82 and dotted numbers, and drops placeholders the model made up", () => {
    // Given
    const masked = maskSensitive("관리인 +82 10.2222.3333");
    // When
    const used = new Set<string>();
    const restored = unmask(`${masked.text} [[P9]] [[N2]]`, masked.values, used);
    // Then
    expect(masked.text).toBe("관리인 [[P1]]");
    expect(restored).toBe("관리인 +82 10.2222.3333  ");
    expect([...used]).toEqual(["[[P1]]"]);
  });

  it("hides door codes written after words like 비번 or 현관, but not room numbers", () => {
    // When
    const masked = maskSensitive(
      "공동현관 비번은 1234* 이고 도어락: #5678 이에요. 현관 앞 101호, 3층 계단에 두세요.",
    );
    // Then
    expect(masked.text).toBe(
      "공동현관 비번은 [[C1]] 이고 도어락: [[C2]] 이에요. 현관 앞 101호, 3층 계단에 두세요.",
    );
    expect(unmask(masked.text, masked.values, new Set())).toBe(
      "공동현관 비번은 1234* 이고 도어락: #5678 이에요. 현관 앞 101호, 3층 계단에 두세요.",
    );
  });

  it("leaves text without sensitive values unchanged", () => {
    // When
    const masked = maskSensitive("음식물 쓰레기는 매주 화·목 밤 9시 이후에 내놓아 주세요.");
    // Then
    expect(masked.values.size).toBe(0);
    expect(masked.text).toBe("음식물 쓰레기는 매주 화·목 밤 9시 이후에 내놓아 주세요.");
  });
});
