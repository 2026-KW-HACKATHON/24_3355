import { describe, expect, it, vi } from "vitest";
import { createTaskRunner } from "./tasks.ts";

describe("createTaskRunner", () => {
  it("runs jobs after the caller returns and lets callers wait for them", async () => {
    // Given
    const runner = createTaskRunner();
    const order: string[] = [];
    // When
    runner.run("first", async () => {
      order.push("job");
    });
    order.push("caller");
    await runner.idle();
    // Then
    expect(order).toEqual(["caller", "job"]);
  });

  it("logs a failing job by name without the error message and keeps running others", async () => {
    // Given
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const runner = createTaskRunner();
    let ran = false;
    // When
    runner.run("broken", async () => {
      throw new TypeError("secret detail");
    });
    runner.run("fine", async () => {
      ran = true;
    });
    await runner.idle();
    // Then
    expect(ran).toBe(true);
    const line = String(error.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toMatchObject({
      event: "background_task_failed",
      task: "broken",
      name: "TypeError",
    });
    expect(line).not.toContain("secret detail");
    error.mockRestore();
  });
});
