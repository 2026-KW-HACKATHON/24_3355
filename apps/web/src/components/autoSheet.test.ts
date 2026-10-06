import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutoSheetQueue } from "./autoSheet";

// 저절로 뜨는 시트는 한 번에 하나(interaction.md §4). 약관 시트(last)는 다른 시트가 끝난 뒤.
describe("auto sheet queue", () => {
  let clock = 0;
  const now = () => clock;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 1_000;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function shown(ms: number) {
    clock += ms;
  }

  it("shows the first sheet that asks and keeps the next one waiting until it closes", () => {
    // Given
    const queue = createAutoSheetQueue({ gapMs: 350, now });
    // When
    queue.request("notify");
    queue.request("reconfirm");
    // Then
    expect(queue.active()).toBe("notify");

    // When: 알림 선택이 닫힘
    shown(2_000);
    queue.release("notify");
    // Then: 닫히는 움직임이 끝날 때까지 아무것도 띄우지 않음
    expect(queue.active()).toBeNull();
    vi.advanceTimersByTime(350);
    expect(queue.active()).toBe("reconfirm");
  });

  it("lets the terms sheet wait for every other waiting sheet even if it asked first", () => {
    // Given: 약관 시트가 먼저 떠 있음(밀어내지 않음)
    const queue = createAutoSheetQueue({ gapMs: 350, now });
    queue.request("memo");
    queue.request("terms", true);
    queue.request("reconfirm");
    expect(queue.active()).toBe("memo");
    // When
    shown(1_000);
    queue.release("memo");
    vi.advanceTimersByTime(350);
    // Then: 늦게 줄 선 재확인이 약관보다 먼저
    expect(queue.active()).toBe("reconfirm");
    shown(1_000);
    queue.release("reconfirm");
    vi.advanceTimersByTime(350);
    expect(queue.active()).toBe("terms");
  });

  it("does not interrupt a sheet that is already showing", () => {
    const queue = createAutoSheetQueue({ gapMs: 350, now });
    queue.request("terms", true);
    expect(queue.active()).toBe("terms");
    queue.request("notify");
    expect(queue.active()).toBe("terms");
  });

  it("waits for the gap even when the next sheet asks after the previous one closed", () => {
    const queue = createAutoSheetQueue({ gapMs: 350, now });
    queue.request("notify");
    shown(1_000);
    queue.release("notify");
    queue.request("memo");
    expect(queue.active()).toBeNull();
    vi.advanceTimersByTime(350);
    expect(queue.active()).toBe("memo");
  });

  it("does not wait after a turn that was never on screen (StrictMode remount)", () => {
    const queue = createAutoSheetQueue({ gapMs: 350, now });
    queue.request("notify");
    queue.release("notify");
    queue.request("notify");
    expect(queue.active()).toBe("notify");
  });

  it("drops a waiting sheet that no longer wants to show and asks once per id", () => {
    const queue = createAutoSheetQueue({ gapMs: 350, now });
    queue.request("notify");
    queue.request("reconfirm");
    queue.request("reconfirm");
    queue.release("reconfirm");
    shown(1_000);
    queue.release("notify");
    vi.advanceTimersByTime(350);
    expect(queue.active()).toBeNull();
  });

  it("tells subscribers when the turn changes", () => {
    const queue = createAutoSheetQueue({ gapMs: 350, now });
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);
    queue.request("notify");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    shown(1_000);
    queue.release("notify");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
