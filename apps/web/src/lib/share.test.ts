import { describe, expect, it } from "vitest";
import { publicBuildingQrUrl, publicBuildingUrl, publicOrigin } from "./share";

const HERE = "https://pr-12.preview.example";

describe("public address printed on the QR", () => {
  it("uses the configured public origin instead of the address that is open now", () => {
    expect(publicOrigin("https://wolgyeham.example/", HERE)).toBe("https://wolgyeham.example");
    expect(publicBuildingUrl("b-1", publicOrigin("https://wolgyeham.example", HERE))).toBe(
      "https://wolgyeham.example/b/b-1",
    );
  });

  it("falls back to the open address when nothing usable is configured", () => {
    expect(publicOrigin(undefined, HERE)).toBe(HERE);
    expect(publicOrigin("", HERE)).toBe(HERE);
    expect(publicOrigin("not a url", HERE)).toBe(HERE);
    expect(publicOrigin("javascript:alert(1)", HERE)).toBe(HERE);
  });
});

describe("QR contents", () => {
  it("marks the printed QR as a front-door entry, but not the shared link", () => {
    const origin = "https://wolgyeham.example";
    expect(publicBuildingQrUrl("b-1", origin)).toBe("https://wolgyeham.example/b/b-1?via=qr");
    expect(publicBuildingUrl("b-1", origin)).toBe("https://wolgyeham.example/b/b-1");
  });
});
