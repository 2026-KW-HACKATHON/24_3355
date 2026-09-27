import type { Guide, GuideCategory } from "@wolgyeham/contracts";
import { describe, expect, it } from "vitest";
import { missingCategories, tileLabels } from "./categories";

function guide(id: string, category: GuideCategory, title: string): Guide {
  return {
    id,
    buildingId: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01",
    category,
    title,
    body: "본문",
    photos: [],
    status: "published",
    position: 0,
    publishedAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
  };
}

describe("guide tiles", () => {
  it("labels a tile by its category", () => {
    // Given
    const guides = [guide("a", "recycling", "분리수거함 위치"), guide("b", "parcel", "택배 보관")];
    // When
    const labels = tileLabels(guides);
    // Then
    expect(labels.get("a")).toBe("분리수거");
    expect(labels.get("b")).toBe("택배");
  });

  it("uses the title when two guides share a category so tiles stay distinct", () => {
    // Given
    const guides = [guide("a", "common", "현관 사용"), guide("b", "common", "옥상 사용")];
    // When
    const labels = tileLabels(guides);
    // Then
    expect(labels.get("a")).toBe("현관 사용");
    expect(labels.get("b")).toBe("옥상 사용");
  });

  it("lists the basic categories that have no guide yet, without the optional contact", () => {
    // Given
    const guides = [guide("a", "recycling", "분리수거함 위치")];
    // When
    const missing = missingCategories(guides);
    // Then
    expect(missing).toEqual(["parcel", "facility", "common"]);
  });
});
