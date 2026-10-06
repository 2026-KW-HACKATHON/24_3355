import { describe, expect, it } from "vitest";
import { AppError } from "../../lib/errors";
import { connectedToast, connectFailureCopy } from "./outcome";

describe("after connecting", () => {
  it("says the residence was confirmed when the code re-confirmed an existing connection", () => {
    // Given
    const result = { alreadyConnected: true, reconfirmed: true };
    // When
    const message = connectedToast(result, "햇살빌라");
    // Then
    expect(message).toBe("거주를 확인했어요");
  });

  it("says it was already connected only when nothing changed", () => {
    expect(connectedToast({ alreadyConnected: true, reconfirmed: false }, "햇살빌라")).toBe(
      "이미 햇살빌라에 연결돼 있어요",
    );
    expect(connectedToast({ alreadyConnected: false, reconfirmed: false }, "햇살빌라")).toBe(
      undefined,
    );
  });
});

describe("when connecting fails", () => {
  it.each(["NETWORK", "INTERNAL_ERROR"] as const)(
    "does not claim the current connection is kept when the result is unknown (%s)",
    (code) => {
      // Given
      const error = new AppError(code);
      // When
      const failure = connectFailureCopy(error, true);
      // Then
      expect(failure.uncertain).toBe(true);
      expect(failure.refetchMe).toBe(true);
      expect(failure.message).not.toContain("그대로예요");
      expect(failure.message).toContain("확인하지 못했어요");
    },
  );

  it("says the current connection is kept when the server refused the switch", () => {
    // Given
    const error = new AppError("RATE_LIMITED");
    // When
    const switching = connectFailureCopy(error, true);
    const fresh = connectFailureCopy(error, false);
    // Then
    expect(switching.message).toContain("지금 연결은 그대로예요");
    expect(switching.uncertain).toBe(false);
    expect(fresh.message).not.toContain("그대로예요");
  });

  it("reloads my info when the login ended or the connection changed", () => {
    expect(connectFailureCopy(new AppError("UNAUTHENTICATED"), false).refetchMe).toBe(true);
    expect(connectFailureCopy(new AppError("ALREADY_CONNECTED"), false).refetchMe).toBe(true);
    expect(connectFailureCopy(new AppError("CONFLICT"), true).refetchMe).toBe(true);
    expect(connectFailureCopy(new AppError("VALIDATION_FAILED"), true).refetchMe).toBe(false);
  });
});
