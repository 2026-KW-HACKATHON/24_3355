import { describe, expect, it } from "vitest";
import { base64UrlToBytes } from "./push";

describe("VAPID public key", () => {
  it("decodes base64url without padding into bytes", () => {
    // Given
    const key = "AQID_-8"; // 01 02 03 ff ef
    // When
    const bytes = base64UrlToBytes(key);
    // Then
    expect([...bytes]).toEqual([1, 2, 3, 255, 239]);
  });
});
