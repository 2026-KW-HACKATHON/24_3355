import { MULTILINE_TEXT, SINGLE_LINE_TEXT } from "@wolgyeham/contracts";
import { describe, expect, it } from "vitest";
import { cleanText } from "./text";

describe("cleanText", () => {
  it("keeps line breaks in multi-line text and drops other control characters", () => {
    // Given
    const pasted = "첫 줄\r\n둘째\t줄\u0007\n셋째";
    // When
    const cleaned = cleanText(pasted, { multiline: true });
    // Then
    expect(cleaned).toBe("첫 줄\n둘째 줄\n셋째");
    expect(MULTILINE_TEXT.test(cleaned)).toBe(true);
  });

  it("turns line breaks into spaces for one-line text", () => {
    // Given
    const pasted = "관리 업체에\n전등 교체를\u0000 맡겼어요";
    // When
    const cleaned = cleanText(pasted, { multiline: false });
    // Then
    expect(cleaned).toBe("관리 업체에 전등 교체를 맡겼어요");
    expect(SINGLE_LINE_TEXT.test(cleaned)).toBe(true);
  });
});
