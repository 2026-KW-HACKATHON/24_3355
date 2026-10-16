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
import { Component as GuideStickersScreen } from "./route";
import { STICKERS_PER_PAGE, stickerPages } from "./stickerContent";

vi.mock("../../lib/api", () => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
  postEmpty: vi.fn(),
  sendJsonEmpty: vi.fn(),
  seg: (value: string) => encodeURIComponent(value),
  http: { get: vi.fn() },
}));

// QR 그림 대신 담긴 주소를 글자로 남겨, 스티커마다 어느 안내를 여는지 확인합니다.
vi.mock("../../components/QrCode", () => ({
  QrCode: ({ value, label }: { value: string; label: string }) => (
    <span className="qr" data-value={value} data-label={label} />
  ),
}));

// SEED 컴포넌트는 CSS를 함께 불러와 node에서 읽을 수 없어, 글자만 남기는 대역으로 바꿉니다.
vi.mock("@seed-design/react", () => ({
  ActionButton: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  Skeleton: () => <span />,
  Snackbar: { AvoidOverlap: ({ children }: { children?: ReactNode }) => children },
  useSnackbarAdapter: () => ({ create: () => undefined }),
}));

const BUILDING_ID = "089d7cfa-ddb9-4eea-b69f-d4319f203a45";
const ORIGIN = "https://wolgyeham.test";

function guide(id: string, category: Guide["category"], title: string, status: Guide["status"]) {
  return {
    id,
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

const building: ManagedBuildingDetail["building"] = {
  id: BUILDING_ID,
  name: "햇살빌라",
  displayAddress: "서울 노원구 광운로",
  status: "open",
  demo: false,
  fullAddress: "서울 노원구 광운로 20",
  openedAt: "2026-10-01T01:00:00.000Z",
  confirmedAt: "2026-10-01T01:00:00.000Z",
};

const me: Me = {
  user: testUser("5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99"),
  managedBuildings: [{ id: BUILDING_ID, name: "햇살빌라" }],
  occupancy: null,
};

function render(guides: Guide[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  queryClient.setQueryData(authKeys.me(), me);
  queryClient.setQueryData(authKeys.demo(), false);
  queryClient.setQueryData(buildingKeys.managed(BUILDING_ID), { building, guides });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/manage/${BUILDING_ID}/stickers`]}>
        <Routes>
          <Route path="/manage/:buildingId/stickers" element={<GuideStickersScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function count(html: string, needle: string) {
  return html.split(needle).length - 1;
}

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: ORIGIN } });
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guide stickers (안내 스티커)", () => {
  it("makes one sticker per published guide that opens that guide", () => {
    // When
    const html = render([
      guide("g-recycle", "recycling", "분리수거는 화·목 저녁", "published"),
      guide("g-parcel", "parcel", "택배는 1층 보관함", "published"),
      guide("g-draft", "common", "쓰는 중인 안내", "draft"),
    ]);
    // Then
    expect(count(html, 'class="st-sticker"')).toBe(2);
    expect(html).toContain(`data-value="${ORIGIN}/b/${BUILDING_ID}/guides/g-recycle?via=sticker"`);
    expect(html).toContain(`data-value="${ORIGIN}/b/${BUILDING_ID}/guides/g-parcel?via=sticker"`);
    expect(html).not.toContain("g-draft");
    expect(html).not.toContain("쓰는 중인 안내");
    expect(html).toContain("분리수거");
    expect(html).toContain("택배는 1층 보관함");
    expect(html).toContain("월계함");
    expect(html).toContain("인쇄하기");
    expect(html).toContain("한 장씩 이미지로 받기");
    expect(count(html, 'class="st-one"')).toBe(2);
  });

  it("lays stickers out fifteen to an A4 page", () => {
    // Given
    const guides = Array.from({ length: STICKERS_PER_PAGE + 1 }, (_, index) =>
      guide(`g-${index}`, "recycling", `안내 ${index}`, "published"),
    );
    // When
    const html = render(guides);
    // Then
    expect(STICKERS_PER_PAGE).toBe(15);
    expect(count(html, 'class="st-sheet"')).toBe(2);
    expect(html).toContain('aria-label="안내 스티커 2쪽"');
    expect(count(html, 'class="st-sticker"')).toBe(16);
  });

  it("splits any list into full pages and a last page", () => {
    expect(stickerPages([])).toEqual([]);
    expect(stickerPages([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(stickerPages(Array.from({ length: 30 }, (_, i) => i)).map((p) => p.length)).toEqual([
      15, 15,
    ]);
  });

  it("asks to publish a guide first when there is none", () => {
    // When
    const html = render([guide("g-draft", "common", "쓰는 중인 안내", "draft")]);
    // Then
    expect(html).toContain("공개한 안내가 없어요");
    expect(html).not.toContain('class="st-sheet"');
    expect(html).not.toContain("인쇄하기");
  });
});
