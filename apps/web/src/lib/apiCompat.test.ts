import { ManagedBuildingDetail, ManagedBuildingList, Me } from "@wolgyeham/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson } from "./api";
import {
  CONFIRMED_AT_UNKNOWN,
  fillManagedDetail,
  fillManagedList,
  fillMeTerms,
  tolerant,
} from "./apiCompat";
import { AppError } from "./errors";

// 이전 API(약관 필드·confirmedAt 없음)와 함께 도는 배포 한 번 동안의 너그러운 파싱.
const URL = "http://localhost/api/me";
const USER_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99";
const BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";

function respond(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const building = {
  id: BUILDING_ID,
  name: "햇살빌라",
  displayAddress: "서울 노원구 월계동 OO길",
  status: "open",
  fullAddress: "서울 노원구 월계동 OO길 12",
  openedAt: null,
};

describe("old API tolerance for /api/me", () => {
  it("does not ask again for terms when the old API has no terms fields", async () => {
    // Given: 약관 필드가 없는 이전 API
    respond({ user: { id: USER_ID }, managedBuildings: [], occupancy: null });
    // When
    const me = await getJson(URL, tolerant(Me, fillMeTerms));
    // Then
    expect(me.user).toEqual({
      id: USER_ID,
      termsVersion: null,
      termsAgreedAt: null,
      termsUpToDate: true,
    });
  });

  it("keeps what the new API says", () => {
    const value = {
      user: { id: USER_ID, termsVersion: null, termsAgreedAt: null, termsUpToDate: false },
      managedBuildings: [],
      occupancy: null,
    };
    expect(fillMeTerms(value)).toBe(value);
  });

  it("still rejects answers that break the contract in other ways", async () => {
    respond({ user: { id: "not-a-uuid" }, managedBuildings: [], occupancy: null });
    await expect(getJson(URL, tolerant(Me, fillMeTerms))).rejects.toBeInstanceOf(AppError);
  });
});

describe("old API tolerance for managed buildings", () => {
  it("treats a building without confirmedAt as already confirmed", () => {
    const detail = ManagedBuildingDetail.parse(fillManagedDetail({ building, guides: [] }));
    expect(detail.building.confirmedAt).toBe(CONFIRMED_AT_UNKNOWN);
    expect(detail.building.confirmedAt).not.toBeNull();
  });

  it("fills every building in the list and keeps a real null", () => {
    const summary = {
      publishedGuideCount: 0,
      draftGuideCount: 0,
      pendingMemoCount: 0,
      newReportCount: 0,
      tipCount: 0,
    };
    const list = ManagedBuildingList.parse(
      fillManagedList({
        buildings: [
          { ...building, ...summary },
          { ...building, ...summary, confirmedAt: null },
        ],
      }),
    );
    expect(list.buildings.map((item) => item.confirmedAt)).toEqual([CONFIRMED_AT_UNKNOWN, null]);
  });
});
