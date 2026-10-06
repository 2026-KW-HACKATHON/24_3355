import { describe, expect, it } from "vitest";
import { readNavigateMessage } from "./RootLayout";
import { isIconLaunch } from "./Splash";

const ORIGIN = "https://wolgyeham.example";

describe("moving inside the open app when a notification is tapped", () => {
  it("accepts only a path on this site", () => {
    expect(readNavigateMessage({ type: "wh:navigate", path: "/b/1/notices/2" }, ORIGIN)).toBe(
      "/b/1/notices/2",
    );
    expect(readNavigateMessage({ type: "wh:navigate", path: "//evil.example" }, ORIGIN)).toBe(
      undefined,
    );
    expect(readNavigateMessage({ type: "wh:navigate", path: "/\\evil.example" }, ORIGIN)).toBe(
      undefined,
    );
    expect(readNavigateMessage({ type: "other", path: "/b/1" }, ORIGIN)).toBe(undefined);
    expect(readNavigateMessage("wh:navigate", ORIGIN)).toBe(undefined);
  });
});

describe("splash (00)", () => {
  it("shows only when the home screen icon opened the app at its start page", () => {
    expect(isIconLaunch("/", true)).toBe(true);
    // 알림을 눌러 공지 주소로 바로 열림
    expect(isIconLaunch("/b/1/notices/2", true)).toBe(false);
    // 현관 QR로 연 브라우저
    expect(isIconLaunch("/", false)).toBe(false);
  });
});
