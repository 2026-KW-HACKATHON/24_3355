import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Guide, ManagedBuildingDetail, Me } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authKeys } from "../../features/auth/queries";
import { buildingKeys } from "../../features/buildings/queries";
import { testUser } from "../../test/me";
import { memoryStorage } from "../../test/memoryStorage";
import { Component as EntranceSignScreen, splitAddress } from "./route";

vi.mock("../../lib/api", () => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
  postEmpty: vi.fn(),
  sendJsonEmpty: vi.fn(),
  seg: (value: string) => encodeURIComponent(value),
  http: { get: vi.fn() },
}));

// SEED 컴포넌트는 CSS를 함께 불러와 node에서 읽을 수 없어, 글자만 남기는 대역으로 바꿉니다.
vi.mock("@seed-design/react", () => ({
  ActionButton: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  Skeleton: () => <span />,
  Snackbar: { AvoidOverlap: ({ children }: { children?: ReactNode }) => children },
}));

const BUILDING_ID = "089d7cfa-ddb9-4eea-b69f-d4319f203a45";
const ORIGIN = "https://wolgyeham.test";

const detail: ManagedBuildingDetail = {
  building: {
    id: BUILDING_ID,
    name: "KW해커톤 전시관",
    displayAddress: "서울 노원구 광운로",
    status: "open",
    fullAddress: "서울 노원구 광운로 20",
    openedAt: "2026-10-01T01:00:00.000Z",
    confirmedAt: "2026-10-01T01:00:00.000Z",
  },
  guides: [
    guide("parcel", "물건은 안내 데스크에 맡겨 주세요", "published"),
    guide("recycling", "쓰레기는 부스 뒤 분리수거함에 버려 주세요", "published"),
    guide("common", "통로에는 물건을 두지 말아 주세요", "draft"),
  ],
};

function guide(category: Guide["category"], title: string, status: Guide["status"]): Guide {
  return {
    id: `${category}-guide`,
    buildingId: BUILDING_ID,
    category,
    title,
    body: "본문",
    status,
    position: 0,
    publishedAt: status === "published" ? "2026-10-01T01:00:00.000Z" : null,
    updatedAt: "2026-10-01T01:00:00.000Z",
  } as Guide;
}

const me: Me = {
  user: testUser("5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99"),
  managedBuildings: [{ id: BUILDING_ID, name: "KW해커톤 전시관" }],
  occupancy: null,
};

function render(joinCode: { code: string; createdAt: string } | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  queryClient.setQueryData(authKeys.me(), me);
  queryClient.setQueryData(authKeys.demo(), false);
  queryClient.setQueryData(buildingKeys.managed(BUILDING_ID), detail);
  queryClient.setQueryData(buildingKeys.joinCode(BUILDING_ID), { joinCode });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/manage/${BUILDING_ID}/sign`]}>
        <Routes>
          <Route path="/manage/:buildingId/sign" element={<EntranceSignScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: ORIGIN } });
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("splitAddress", () => {
  it("splits the district from the road and number", () => {
    expect(splitAddress("서울 노원구 광운로 20")).toEqual({
      district: "서울 노원구",
      road: "광운로 20",
    });
    expect(splitAddress("서울특별시 노원구 월계로 00길 7")).toEqual({
      district: "서울특별시 노원구",
      road: "월계로 00길 7",
    });
  });

  it("keeps the whole address on the big line when there is no district", () => {
    expect(splitAddress("광운로 20")).toEqual({ district: "", road: "광운로 20" });
  });
});

describe("entrance sign (현관 안내문)", () => {
  it("lays out the poster with this building's address, name, QR and guide topics", () => {
    // When
    const html = render({ code: "KW2026", createdAt: "2026-10-01T01:00:00.000Z" });
    // Then
    expect(html).toContain('aria-label="KW해커톤 전시관 현관 안내문"');
    expect(html).toContain("서울 노원구");
    expect(html).toContain("광운로 20");
    expect(html).toContain("KW해커톤 전시관 생활안내");
    expect(html).toContain("이 건물의 안내,");
    expect(html).toContain('aria-label="KW해커톤 전시관 건물 안내 QR"');
    expect(html).toContain("카메라로 QR을 비추면 가입 없이 안내가 열려요");
    expect(html).toContain("분리수거 · 택배");
    expect(html).toContain("월계함");
    expect(html).not.toContain("wolgye.kr");
    expect(html).toContain("인쇄하기");
    expect(html).toContain('aria-label="뒤로"');
  });

  it("leaves the join code off the sheet until it is switched on", () => {
    // When
    const html = render({ code: "KW2026", createdAt: "2026-10-01T01:00:00.000Z" });
    // Then
    expect(html).toContain("가입코드도 함께 싣기");
    expect(html).not.toContain("알림 받기 가입코드");
    expect(html).not.toContain(">KW2026<");
  });

  it("prints only the QR when there is no join code yet", () => {
    // When
    const html = render(null);
    // Then
    expect(html).not.toContain("가입코드도 함께 싣기");
    expect(html).toContain("가입코드가 없어 QR만 실었어요");
  });
});
