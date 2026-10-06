import type { Notice } from "@wolgyeham/contracts";
import { describe, expect, it } from "vitest";
import { findPostedNotice } from "./findPosted";

const SENT_AT = Date.parse("2026-09-29T12:00:00.000Z");

function notice(overrides: Partial<Notice>): Notice {
  return {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f21",
    buildingId: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01",
    title: "오전 단수 안내",
    body: "물탱크 청소",
    startsAt: "2026-09-30T00:00:00.000Z",
    endsAt: "2026-09-30T03:00:00.000Z",
    publishedAt: "2026-09-29T12:00:03.000Z",
    ...overrides,
  };
}

describe("finding a notice whose post result was unknown", () => {
  it("finds the notice with the same title and start that was just published", () => {
    // Given
    const posted = notice({});
    // When
    const found = findPostedNotice(
      [notice({ id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f22", title: "다른 공지" }), posted],
      { title: " 오전 단수 안내 ", startsAt: "2026-09-30T09:00:00+09:00" },
      SENT_AT,
    );
    // Then
    expect(found?.id).toBe(posted.id);
  });

  it("does not treat an older notice with the same title as this one", () => {
    // Given
    const older = notice({ publishedAt: "2026-09-20T12:00:00.000Z" });
    // When
    const found = findPostedNotice(
      [older],
      { title: "오전 단수 안내", startsAt: "2026-09-30T00:00:00.000Z" },
      SENT_AT,
    );
    // Then
    expect(found).toBeUndefined();
  });

  it("does not match a different start time", () => {
    // Given
    const other = notice({ startsAt: "2026-10-01T00:00:00.000Z" });
    // When
    const found = findPostedNotice(
      [other],
      { title: "오전 단수 안내", startsAt: "2026-09-30T00:00:00.000Z" },
      SENT_AT,
    );
    // Then
    expect(found).toBeUndefined();
  });
});
