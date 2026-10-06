import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postJson } from "../../lib/api";
import { AppError, type AppErrorCode } from "../../lib/errors";
import { memoryStorage } from "../../test/memoryStorage";
import { acceptInvite, previewInvite } from "./queries";
import { loadInviteToken, stashInviteToken } from "./token";

// 응답을 AppError로 바꾸는 부분은 lib/api.test.ts가 봅니다. 여기서는 그 뒤의 토큰 처리만 봅니다.
vi.mock("../../lib/api", () => ({ postJson: vi.fn() }));

function failWith(code: AppErrorCode) {
  vi.mocked(postJson).mockRejectedValueOnce(new AppError(code));
}

const SEND = { preview: previewInvite, accept: acceptInvite } as const;

beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
  stashInviteToken("invite-token");
});

afterEach(() => {
  vi.mocked(postJson).mockReset();
  vi.unstubAllGlobals();
});

describe("invite token after a failed request", () => {
  it.each([
    ["preview", "NOT_FOUND"],
    ["preview", "INVITE_EXPIRED"],
    ["preview", "VALIDATION_FAILED"],
    ["accept", "NOT_FOUND"],
    ["accept", "INVITE_EXPIRED"],
    ["accept", "CONFLICT"],
  ] as const)("forgets the token when %s fails with %s", async (step, code) => {
    // Given
    failWith(code);
    // When
    const error = await SEND[step]("invite-token").catch((caught: unknown) => caught);
    // Then
    expect(error).toMatchObject({ code });
    expect(loadInviteToken()).toBeUndefined();
  });

  it.each([
    ["preview", "NETWORK"],
    ["preview", "INTERNAL_ERROR"],
    ["accept", "NETWORK"],
    ["accept", "INTERNAL_ERROR"],
    ["accept", "RATE_LIMITED"],
    ["accept", "UNAUTHENTICATED"],
  ] as const)("keeps the token when %s fails with %s so a retry can work", async (step, code) => {
    // Given
    failWith(code);
    // When
    const error = await SEND[step]("invite-token").catch((caught: unknown) => caught);
    // Then
    expect(error).toMatchObject({ code });
    expect(loadInviteToken()).toBe("invite-token");
  });

  it("sends the token only in the body", async () => {
    // Given
    vi.mocked(postJson).mockResolvedValueOnce({ buildingName: "햇살빌라" });
    // When
    await previewInvite("invite-token");
    // Then
    expect(postJson).toHaveBeenCalledWith(
      "/api/manager-invites/preview",
      { token: "invite-token" },
      expect.anything(),
    );
    expect(loadInviteToken()).toBe("invite-token");
  });
});
