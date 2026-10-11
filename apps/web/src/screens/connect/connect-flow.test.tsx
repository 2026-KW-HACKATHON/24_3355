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
import { Component as ConnectScreen, connectLoginReturn } from "./route";

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
  demo: false,
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

  it("resumes at 2/2 after Kakao login even when the browser comes back in a new tab", () => {
    // Given: 1/2에서 확인한 코드를 남기고 카카오 로그인으로 갔습니다.
    saveConnectDraft({
      buildingId: BUILDING_ID,
      buildingName: "햇살빌라",
      code: "WK72P4",
      returnTo: `/b/${BUILDING_ID}`,
    });
    // When: 안드로이드에서 카카오톡 앱을 거쳐 새 탭으로 돌아오면 탭 저장소(sessionStorage)는 비어 있습니다.
    vi.stubGlobal("sessionStorage", memoryStorage());
    const html = render(me(null));
    // Then: 코드 단계가 아니라 2/2 확인 화면, 누르기 전에는 보내지 않는 연결 버튼 하나
    expect(html).toContain("2 / 2 · 연결 확인");
    expect(html).toContain("연결할까요?");
    expect(html.match(/햇살빌라에 연결하기/g)).toHaveLength(1);
    expect(html).not.toContain("이 건물에 살고 있나요?");
  });

  it("does not show the move screen to a demo account on a real building (D-35)", () => {
    // Given: 시연 입주자 A(햇살빌라 연결)가 실제 건물(demo: false)의 연결 화면을 엽니다.
    const demo: Me = {
      ...me(occupancy({ buildingId: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f02" })),
      user: testUser("user-a", { demo: "demo-resident-a" }),
    };
    // When
    const html = render(demo);
    // Then: 시연을 끝내는 동안 기다리고, ‘옮길까요’로 가지 않습니다.
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("옮길까요");
  });
});

describe("Kakao return path from the connect screen", () => {
  it("rebuilds the connect URL and keeps other query values such as via=qr", () => {
    const home = `/b/${BUILDING_ID}`;
    expect(connectLoginReturn(BUILDING_ID, home, "")).toBe(`${home}/connect`);
    expect(connectLoginReturn(BUILDING_ID, home, "?via=qr&login=failed")).toBe(
      `${home}/connect?via=qr`,
    );
    expect(
      connectLoginReturn(
        BUILDING_ID,
        `${home}/tips`,
        `?returnTo=%2Fb%2F${BUILDING_ID}%2Ftips&via=qr`,
      ),
    ).toBe(`${home}/connect?returnTo=${home}/tips&via=qr`);
  });
});
