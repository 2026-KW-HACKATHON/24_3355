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
import { Component as SettingsScreen } from "./route";

vi.mock("../../lib/api", () => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
  postEmpty: vi.fn(),
  sendJsonEmpty: vi.fn(),
  seg: (value: string) => encodeURIComponent(value),
  http: { get: vi.fn() },
}));

vi.mock("@seed-design/react", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Root = ({ open, children }: { open?: boolean; children?: ReactNode }) =>
    open ? children : null;
  const Parts = { Root, Positioner: Pass, Backdrop: Pass, Content: Pass, Header: Pass };
  return {
    ActionButton: ({ children }: { children?: ReactNode }) => (
      <button type="button">{children}</button>
    ),
    Skeleton: () => <span />,
    Portal: Pass,
    BottomSheet: { ...Parts, Handle: Pass, Body: Pass, Title: Pass },
    Snackbar: { AvoidOverlap: ({ children }: { children?: ReactNode }) => children },
    useSnackbarAdapter: () => ({ create: () => undefined }),
  };
});

const BUILDING_ID = "089d7cfa-ddb9-4eea-b69f-d4319f203a45";

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
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("landlord settings", () => {
  it("offers a real switch for new memo and report alerts", () => {
    // Given
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    queryClient.setQueryData(authKeys.me(), me);
    queryClient.setQueryData(authKeys.demo(), false);
    queryClient.setQueryData(buildingKeys.managed(BUILDING_ID), detail);
    // When
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/manage/${BUILDING_ID}/settings`]}>
          <Routes>
            <Route path="/manage/:buildingId/settings" element={<SettingsScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Then
    expect(html).toContain("새 메모·제보 알림");
    expect(html).toContain("새 수정 메모·제보를 이 휴대폰으로 받을지 골라요");
    expect(html).not.toContain("다음 업데이트에서 열려요");
    const row = html.slice(html.lastIndexOf("<button", html.indexOf("새 메모·제보 알림")));
    expect(row.slice(0, row.indexOf(">"))).not.toContain("disabled");
  });
});
