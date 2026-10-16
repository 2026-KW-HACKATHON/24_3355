import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ManagedBuildingDetail, Me } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authKeys } from "../../features/auth/queries";
import { buildingKeys } from "../../features/buildings/queries";
import { testUser } from "../../test/me";
import { memoryStorage } from "../../test/memoryStorage";
import { BIZCARDS_PER_SHEET, BizCardSheet, Component as MoveInCardScreen } from "./route";

vi.mock("../../lib/api", () => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
  postEmpty: vi.fn(),
  sendJsonEmpty: vi.fn(),
  seg: (value: string) => encodeURIComponent(value),
  http: { get: vi.fn() },
}));

vi.mock("../../components/QrCode", () => ({
  QrCode: ({ value, label }: { value: string; label: string }) => (
    <span className="qr" data-value={value} data-label={label} />
  ),
}));

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

const detail: ManagedBuildingDetail = {
  building: {
    id: BUILDING_ID,
    name: "햇살빌라",
    displayAddress: "서울 노원구 광운로",
    status: "open",
    demo: false,
    fullAddress: "서울 노원구 광운로 20",
    openedAt: "2026-10-01T01:00:00.000Z",
    confirmedAt: "2026-10-01T01:00:00.000Z",
  },
  guides: [],
};

const me: Me = {
  user: testUser("5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99"),
  managedBuildings: [{ id: BUILDING_ID, name: "햇살빌라" }],
  occupancy: null,
};

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: ORIGIN } });
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function count(html: string, needle: string) {
  return html.split(needle).length - 1;
}

describe("move-in card print size (39)", () => {
  it("keeps the usual card by default and offers the business-card size", () => {
    // Given
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    queryClient.setQueryData(authKeys.me(), me);
    queryClient.setQueryData(authKeys.demo(), false);
    queryClient.setQueryData(buildingKeys.managed(BUILDING_ID), detail);
    queryClient.setQueryData(buildingKeys.joinCode(BUILDING_ID), {
      joinCode: { code: "KW2026", createdAt: "2026-10-01T01:00:00.000Z" },
    });
    // When
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/manage/${BUILDING_ID}/card`]}>
          <Routes>
            <Route path="/manage/:buildingId/card" element={<MoveInCardScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Then
    expect(html).toContain('aria-label="햇살빌라 입주 카드"');
    expect(html).toContain("인쇄 크기");
    expect(html).toContain("기본 카드");
    expect(html).toContain("명함 크기(90×50mm, 절취선)");
    expect(html).not.toContain("mc-bizsheet");
  });

  it("prints ten business cards with the QR and join code on one A4 sheet", () => {
    // When
    const html = renderToStaticMarkup(
      <BizCardSheet
        buildingName="햇살빌라"
        qrUrl={`${ORIGIN}/b/${BUILDING_ID}?via=qr`}
        code="KW2026"
        host="wolgyeham.test"
      />,
    );
    // Then
    expect(BIZCARDS_PER_SHEET).toBe(10);
    expect(count(html, 'class="mc-biz"')).toBe(10);
    expect(count(html, `data-value="${ORIGIN}/b/${BUILDING_ID}?via=qr"`)).toBe(10);
    expect(count(html, ">KW2026<")).toBe(10);
    expect(html).toContain("새 공지 받기 가입코드");
    expect(html).toContain("햇살빌라 생활 안내");
  });
});
