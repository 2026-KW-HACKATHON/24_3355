import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizePhoto, PHOTO_QUEUE_MAX_WAITING, PhotoBusyError } from "./photoImage.ts";

describe("photo processing queue", () => {
  it("takes one running photo plus three waiting, and turns the next away", async () => {
    // Given
    const png = new Uint8Array(
      await sharp({ create: { width: 400, height: 300, channels: 3, background: "#25355a" } })
        .png()
        .toBuffer(),
    );

    // When
    const runs = Array.from({ length: PHOTO_QUEUE_MAX_WAITING + 2 }, () =>
      normalizePhoto(png, "image/png").then(
        () => "ok",
        (error: unknown) => (error instanceof PhotoBusyError ? "busy" : "error"),
      ),
    );

    // Then
    expect(await Promise.all(runs)).toEqual(["ok", "ok", "ok", "ok", "busy"]);
    // 줄이 빠지면 다시 받습니다
    await expect(normalizePhoto(png, "image/png")).resolves.toMatchObject({ width: 400 });
  });
});
