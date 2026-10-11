import { describe, expect, it } from "vitest";
import { reportSendError } from "../features/reports/labels";
import { tipWriteError } from "../features/tips/labels";
import { AppError, DEMO_READONLY_MESSAGE, errorMessage, isDemoReadOnly } from "./errors";

describe("read-only demo message (D-35)", () => {
  const readOnly = new AppError("FORBIDDEN", { fields: { account: "demo-readonly" } });
  const plain = new AppError("FORBIDDEN");

  it("maps the server's demo-readonly refusal to one friendly line everywhere writes fail", () => {
    expect(DEMO_READONLY_MESSAGE).toBe("시연에서는 둘러보기만 할 수 있어요");
    expect(isDemoReadOnly(readOnly)).toBe(true);
    expect(errorMessage(readOnly)).toBe(DEMO_READONLY_MESSAGE);
    expect(reportSendError(readOnly)).toBe(DEMO_READONLY_MESSAGE);
    expect(tipWriteError(readOnly, "save")).toBe(DEMO_READONLY_MESSAGE);
  });

  it("keeps the other FORBIDDEN messages", () => {
    expect(isDemoReadOnly(plain)).toBe(false);
    expect(errorMessage(plain)).toBe("이 작업을 할 수 있는 권한이 없어요");
    expect(tipWriteError(plain, "save")).toBe("집주인 계정으로는 생활 팁을 남길 수 없어요");
  });
});
