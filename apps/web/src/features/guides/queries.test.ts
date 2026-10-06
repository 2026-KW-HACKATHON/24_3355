import { PublishGuideResult } from "@wolgyeham/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteEmpty, postJson } from "../../lib/api";
import { discardRevision, publishGuide } from "./queries";

vi.mock("../../lib/api", async (original) => ({
  ...(await original<typeof import("../../lib/api")>()),
  postJson: vi.fn(async () => undefined),
  deleteEmpty: vi.fn(async () => undefined),
}));

const GUIDE = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f12";
const MEMO = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f52";

afterEach(() => {
  vi.clearAllMocks();
});

describe("publishing a fixed guide (43)", () => {
  it("sends the memos to apply in the same request as the publish", async () => {
    // Given
    const applyMemoIds = [MEMO];
    // When
    await publishGuide(GUIDE, applyMemoIds);
    // Then
    expect(postJson).toHaveBeenCalledWith(
      `/api/guides/${GUIDE}/publish`,
      { applyMemoIds: [MEMO] },
      PublishGuideResult,
    );
  });

  it("sends an empty list for a first publish", async () => {
    // Given
    const applyMemoIds: string[] = [];
    // When
    await publishGuide(GUIDE, applyMemoIds);
    // Then
    expect(postJson).toHaveBeenCalledWith(
      `/api/guides/${GUIDE}/publish`,
      { applyMemoIds: [] },
      PublishGuideResult,
    );
  });

  it("cancels an edit by deleting only the saved revision", async () => {
    // Given
    const guideId = GUIDE;
    // When
    await discardRevision(guideId);
    // Then
    expect(deleteEmpty).toHaveBeenCalledWith(`/api/guides/${GUIDE}/revision`);
    expect(postJson).not.toHaveBeenCalled();
  });
});
