import { describe, expect, it } from "vitest";
import {
  extractJoinCode,
  isCompleteJoinCode,
  lockMinutesLeft,
  mergePastedJoinCode,
  sanitizeJoinCode,
} from "./joinCode";

describe("join code input", () => {
  it("keeps only upper-case letters and digits, six at most", () => {
    // Given
    const typed = "wk7-2p4x";
    // When
    const value = sanitizeJoinCode(typed);
    // Then
    expect(value).toBe("WK72P4");
  });

  it("finds the code inside a pasted message", () => {
    // Given
    const messages = ["가입코드: WK7-2P4", "Code: wk72p4 (월계함)", "wk7 2p4", " WK72P4 \n"];
    // When
    const codes = messages.map(extractJoinCode);
    // Then
    expect(codes).toEqual(["WK72P4", "WK72P4", "WK72P4", "WK72P4"]);
  });

  it("accepts the separators the server accepts between any two characters", () => {
    // Given
    const pasted = "W K 7 2 P 4";
    // When
    const code = extractJoinCode(pasted);
    // Then
    expect(code).toBe("WK72P4");
  });

  it("picks the code next to the “가입코드” label when a message has other letter groups", () => {
    // Given
    const messages = [
      "새봄하우스 ABC 234호, 가입코드는 WK7-2P4예요",
      "가입코드 WK7-2P4 (새봄하우스 ABC 234호)",
      "안녕하세요 HMR 2F3 도착했어요 코드: WK72P4",
    ];
    // When
    const codes = messages.map(extractJoinCode);
    // Then
    expect(codes).toEqual(["WK72P4", "WK72P4", "WK72P4"]);
  });

  it("does not pick letters the server never uses (0 O 1 I L) out of a sentence", () => {
    // Given
    const messages = ["ABC 123 하우스", "월계동 OIL 101 빌라", "LOL 010 입니다"];
    // When
    const codes = messages.map(extractJoinCode);
    // Then
    expect(codes).toEqual(["", "", ""]);
  });

  it("keeps the typed value when a pasted sentence has no code in it", () => {
    // Given
    const current = "WK7";
    // When
    const value = mergePastedJoinCode(current, "ABC 123 하우스");
    // Then
    expect(value).toBe("WK7");
  });

  it("prefers a mix of letters and digits when there is no label", () => {
    // Given
    const message = "THANKS WK72P4 부탁해요";
    // When
    const code = extractJoinCode(message);
    // Then
    expect(code).toBe("WK72P4");
  });

  it("replaces a half-typed value when a whole code is pasted", () => {
    // Given
    const current = "WK";
    // When
    const whole = mergePastedJoinCode(current, "WK72P4");
    const part = mergePastedJoinCode(current, "72");
    // Then
    expect(whole).toBe("WK72P4");
    expect(part).toBe("WK72");
  });

  it("is complete only with six characters", () => {
    // Given
    const values = ["WK72P4", "WK72P", ""];
    // When
    const results = values.map(isCompleteJoinCode);
    // Then
    expect(results).toEqual([true, false, false]);
  });
});

describe("lock wait", () => {
  it("rounds the remaining wait up to whole minutes and stops at zero", () => {
    // Given
    const now = 1_000_000;
    // When
    const results = [
      lockMinutesLeft(now + 600_000, now),
      lockMinutesLeft(now + 61_000, now),
      lockMinutesLeft(now + 1_000, now),
      lockMinutesLeft(now - 1_000, now),
    ];
    // Then
    expect(results).toEqual([10, 2, 1, 0]);
  });
});
