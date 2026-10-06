import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Me, MeOccupancy, PublicBuilding } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authKeys } from "../../features/auth/queries";
import { buildingKeys } from "../../features/buildings/queries";
import { saveConnectDraft } from "../../features/occupancy/connectDraft";
import { testUser } from "../../test/me";
import { memoryStorage } from "../../test/memoryStorage";
import { Component as ConnectScreen } from "./route";

// SEED 컴포넌트는 CSS를 함께 불러와 node에서 읽을 수 없어, 글자와 disabled만 남기는 대역으로 바꿉니다.
vi.mock("@seed-design/react", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  // 시트·대화상자는 열렸을 때만 그립니다.
  const Root = ({ open, children }: { open?: boolean; children?: ReactNode }) =>
    open ? children : null;
  const Parts = { Root, Positioner: Pass, Backdrop: Pass, Content: Pass, Header: Pass };
  return {
    ActionButton: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) => (
      <button type="button" disabled={disabled}>
        {children}
      </button>
    ),
    Skeleton: () => <span />,
    Portal: Pass,
    BottomSheet: { ...Parts, Handle: Pass, Body: Pass, Title: Pass },
    Dialog: { ...Parts, Title: Pass, Description: Pass, Footer: Pass },
    // 하단 버튼·탭은 토스트가 가리지 않게 Snackbar.AvoidOverlap으로 감쌉니다(components/Screen.tsx).
    Snackbar: { AvoidOverlap: ({ children }: { children?: ReactNode }) => children },
    useSnackbarAdapter: () => ({ create: () => undefined }),
  };
});

// 서버 렌더로 첫 화면만 봅니다(slice-b-states.test.tsx와 같은 방식). 요청은 보내지 않습니다.
const BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
const building: PublicBuilding = {
  id: BUILDING_ID,
  name: "햇살빌라",
  displayAddress: "서울 노원구 월계동 OO길",
  status: "open",
};

function occupancy(overrides: Partial<MeOccupancy> = {}): MeOccupancy {
  return {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f41",
    buildingId: BUILDING_ID,
    buildingName: "햇살빌라",
    status: "active",
    connectedAt: "2025-09-01T01:00:00.000Z",
    lastReconfirmedAt: null,
    nextReconfirmAt: "2026-09-01T01:00:00.000Z",
    reconfirmRequested: false,
    reconfirmDueAt: "2026-09-15T01:00:00.000Z",
    endedAt: null,
    ...overrides,
  };
}

function render(me: Me | null) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  queryClient.setQueryData(authKeys.me(), me);
  queryClient.setQueryData(authKeys.demo(), false);
  queryClient.setQueryData(buildingKeys.public(BUILDING_ID), building);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/b/${BUILDING_ID}/connect`]}>
        <Routes>
          <Route path="/b/:buildingId/connect" element={<ConnectScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function me(occ: MeOccupancy | null): Me {
  return { user: testUser("user-a"), managedBuildings: [], occupancy: occ };
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connect (LF-04) paths", () => {
  it("offers logging in without a code to someone who already connected elsewhere", () => {
    // When
    const signedOut = render(null);
    const signedIn = render(me(null));
    // Then
    expect(signedOut).toContain("이미 연결했어요 · 로그인");
    expect(signedIn).not.toContain("이미 연결했어요 · 로그인");
  });

  it("lets a resident asked to re-confirm enter the code again instead of a dead end (D-17)", () => {
    // Given
    const asked = me(occupancy({ reconfirmRequested: true }));
    const needed = me(occupancy({ status: "reconfirm_needed", reconfirmRequested: true }));
    const settled = me(occupancy());
    // When
    const [askedHtml, neededHtml, settledHtml] = [asked, needed, settled].map(render);
    // Then
    expect(askedHtml).toContain("이 건물에 살고 있나요?");
    expect(askedHtml).toContain("계속 사는 것으로 확인해요");
    expect(neededHtml).toContain("이 건물에 살고 있나요?");
    expect(settledHtml).toContain("이미 햇살빌라에 연결돼 있어요");
  });

  it("puts a 보기 next to each required consent, outside the checkbox label", () => {
    // Given
    saveConnectDraft({
      buildingId: BUILDING_ID,
      buildingName: "햇살빌라",
      code: "WK72P4",
      returnTo: "/",
    });
    // When
    const html = render(null);
    // Then
    expect(html).toContain('aria-label="서비스 이용약관 보기"');
    expect(html).toContain('aria-label="개인정보 수집·이용 보기"');
    expect(html).not.toMatch(/<label[^>]*>(?:(?!<\/label>).)*<button/s);
  });
});
