import { describe, expect, it } from "vitest";
import { readViaQr, searchWithoutVia } from "./viaQr";

describe("front-door QR param (?via=qr)", () => {
  it("is read only from the printed QR address", () => {
    expect(readViaQr("?via=qr")).toBe(true);
    expect(readViaQr("?login=cancelled&via=qr")).toBe(true);
    expect(readViaQr("")).toBe(false);
    expect(readViaQr("?via=link")).toBe(false);
  });

  it("is removed from the address and keeps the other params", () => {
    expect(searchWithoutVia("?via=qr")).toBe("");
    expect(searchWithoutVia("?via=qr&login=cancelled")).toBe("?login=cancelled");
    expect(searchWithoutVia("?login=cancelled")).toBe(undefined);
    expect(searchWithoutVia("")).toBe(undefined);
  });
});
