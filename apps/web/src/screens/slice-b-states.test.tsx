import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Guide, Me, MeOccupancy, Notice, PublicBuilding } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authKeys } from "../features/auth/queries";
import { buildingKeys } from "../features/buildings/queries";
import { noticeKeys } from "../features/notices/queries";
import { saveConnectDraft } from "../features/occupancy/connectDraft";
import { type NotifyActions, NotifyChoiceBody } from "../features/push/NotifyChoiceSheet";
import { AppError } from "../lib/errors";
import type { PushEnv } from "../lib/pushEnv";
import { testUser } from "../test/me";
import { memoryStorage } from "../test/memoryStorage";
import { Component as ConnectScreen } from "./connect/route";
import { Component as MeScreen } from "./me/route";
import { Component as NoticeDetailScreen } from "./notice-detail/route";
import { Component as ResidentHomeScreen } from "./resident-home/route";

// 서버 렌더로 첫 화면만 봅니다. 요청은 보내지 않고 캐시에 넣은 상태로 그립니다(signed-in-state.test.tsx와 같은 방식).
vi.mock("@seed-design/react", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  // 시트·대화상자는 열렸을 때만 그립니다.
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
    Dialog: { ...Parts, Title: Pass, Description: Pass, Footer: Pass },
    // 하단 버튼·탭은 토스트가 가리지 않게 Snackbar.AvoidOverlap으로 감쌉니다(components/Screen.tsx).
    Snackbar: { AvoidOverlap: ({ children }: { children?: ReactNode }) => children },
    useSnackbarAdapter: () => ({ create: () => undefined }),
  };
});

const BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
const OTHER_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f02";
const NOTICE_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f21";

const building: PublicBuilding = {
  id: BUILDING_ID,
  name: "햇살빌라",
  displayAddress: "서울 노원구 월계동 OO길",
  status: "open",
};
const guide: Guide = {
  id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f11",
  buildingId: BUILDING_ID,
  category: "recycling",
  title: "분리수거함은 주차장 안쪽에 있어요",
  body: "재활용은 화·금",
  photos: [],
  status: "published",
  position: 0,
  publishedAt: "2026-03-16T01:00:00.000Z",
  updatedAt: "2026-03-16T01:00:00.000Z",
};
const notice: Notice = {
  id: NOTICE_ID,
  buildingId: BUILDING_ID,
  title: "오전 단수 안내",
  body: "물탱크 청소",
  startsAt: "2026-09-28T01:00:00.000Z",
  endsAt: "2026-09-28T03:00:00.000Z",
  publishedAt: "2026-09-22T01:00:00.000Z",
};

function occupancy(buildingId: string, buildingName: string): MeOccupancy {
  return {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f41",
    buildingId,
    buildingName,
    status: "active",
    connectedAt: "2026-03-02T01:00:00.000Z",
    lastReconfirmedAt: null,
    nextReconfirmAt: "2027-03-02T01:00:00.000Z",
    reconfirmRequested: false,
    reconfirmDueAt: "2027-03-16T01:00:00.000Z",
    endedAt: null,
  };
}

function me(occ: MeOccupancy | null): Me {
  return {
    user: testUser("5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99"),
    managedBuildings: [],
    occupancy: occ,
  };
}

function client(
  meData: Me | null,
  extra: (queryClient: QueryClient) => void = () => undefined,
): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  queryClient.setQueryData(authKeys.me(), meData);
  queryClient.setQueryData(authKeys.demo(), false);
  queryClient.setQueryData(buildingKeys.public(BUILDING_ID), building);
  queryClient.setQueryData(buildingKeys.guides(BUILDING_ID), { guides: [guide] });
  queryClient.setQueryData(noticeKeys.list(BUILDING_ID), { notices: [notice] });
  extra(queryClient);
  return queryClient;
}

function render(
  path: string,
  route: string,
  element: ReactNode,
  queryClient: QueryClient,
  state?: unknown,
) {
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connect (LF-04)", () => {
  const path = `/b/${BUILDING_ID}/connect`;
  const route = "/b/:buildingId/connect";
  const draft = {
    buildingId: BUILDING_ID,
    buildingName: "햇살빌라",
    code: "WK72P4",
    returnTo: "/",
  };

  it("starts with the join code when nothing was checked yet", () => {
    // Given
    const queryClient = client(null);
    // When
    const html = render(path, route, <ConnectScreen />, queryClient);
    // Then
    expect(html).toContain("이 건물에 살고 있나요?");
    expect(html).toContain("1 / 2");
    expect(html).not.toContain("카카오로 계속하기");
  });

  it("asks to log in after the code was checked, keeping the code", () => {
    // Given
    saveConnectDraft(draft);
    const queryClient = client(null);
    // When
    const html = render(path, route, <ConnectScreen />, queryClient);
    // Then
    expect(html).toContain("로그인이 필요해요");
    expect(html).toContain("WK72P4");
    expect(html).toContain("카카오로 계속하기");
  });

  it("waits for one more press after login instead of connecting on its own", () => {
    // Given
    saveConnectDraft(draft);
    const queryClient = client(me(null));
    // When
    const html = render(path, route, <ConnectScreen />, queryClient);
    // Then
    expect(html).toContain("햇살빌라에 연결하기");
    expect(html).not.toContain("카카오로 계속하기");
  });

  it("confirms before moving from another building", () => {
    // Given
    saveConnectDraft(draft);
    const queryClient = client(me(occupancy(OTHER_ID, "새봄하우스")));
    // When
    const html = render(path, route, <ConnectScreen />, queryClient);
    // Then
    expect(html).toContain("연결할 건물을");
    expect(html).toContain("새봄하우스");
    expect(html).toContain("그대로 두기");
    expect(html).toContain("햇살빌라로 옮기기");
  });

  it("does not offer to connect again to the same building", () => {
    // Given
    const queryClient = client(me(occupancy(BUILDING_ID, "햇살빌라")));
    // When
    const html = render(path, route, <ConnectScreen />, queryClient);
    // Then
    expect(html).toContain("이미 햇살빌라에 연결돼 있어요");
    expect(html).not.toContain("이 건물에 살고 있나요?");
  });

  it("asks to retry instead of the login step when /api/me fails", () => {
    // Given
    saveConnectDraft(draft);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    queryClient.setQueryData(buildingKeys.public(BUILDING_ID), building);
    queryClient
      .getQueryCache()
      .build(queryClient, { queryKey: authKeys.me() })
      .setState({ status: "error", error: new AppError("NETWORK"), fetchStatus: "idle" });
    // When
    const html = render(path, route, <ConnectScreen />, queryClient);
    // Then
    expect(html).toContain("불러오지 못했어요");
    expect(html).not.toContain("로그인이 필요해요");
  });
});

describe("resident home (LF-05)", () => {
  const path = `/b/${BUILDING_ID}`;
  const route = "/b/:buildingId";

  it("welcomes with hami only right after the first connection (10)", () => {
    // Given
    const queryClient = client(me(occupancy(BUILDING_ID, "햇살빌라")));
    const state = { connected: { buildingId: BUILDING_ID, buildingName: "햇살빌라", first: true } };
    // When
    const html = render(path, route, <ResidentHomeScreen />, queryClient, state);
    // Then
    expect(html).toContain("햇살빌라에 연결됐어요");
    expect(html).toContain("wh-hami");
    expect(html).toContain("우리 건물");
    expect(html).toContain("내 정보");
  });

  it("shows the building without hami when coming back (03)", () => {
    // Given
    const queryClient = client(me(occupancy(BUILDING_ID, "햇살빌라")));
    // When
    const html = render(path, route, <ResidentHomeScreen />, queryClient);
    // Then
    expect(html).not.toContain("연결됐어요");
    expect(html).not.toContain("wh-hami");
    expect(html).toContain("거주 중");
    expect(html).toContain("오전 단수 안내");
  });
});

describe("notice detail (LF-03)", () => {
  const path = `/b/${BUILDING_ID}/notices/${NOTICE_ID}`;
  const route = "/b/:buildingId/notices/:noticeId";

  it("shows the period and target of a running notice", () => {
    // Given
    const queryClient = client(null, (queryClient) =>
      queryClient.setQueryData(noticeKeys.detail(NOTICE_ID), notice),
    );
    // When
    const html = render(path, route, <NoticeDetailScreen />, queryClient);
    // Then
    expect(html).toContain("적용 기간");
    expect(html).toContain("오전 10시 ~ 낮 12시");
    expect(html).toContain("햇살빌라 전 세대");
  });

  it("shows the ended state with a way back to the guides, not a toast", () => {
    // Given
    const queryClient = client(null, (queryClient) =>
      queryClient
        .getQueryCache()
        .build(queryClient, { queryKey: noticeKeys.detail(NOTICE_ID) })
        .setState({ status: "error", error: new AppError("NOTICE_ENDED"), fetchStatus: "idle" }),
    );
    // When
    const html = render(path, route, <NoticeDetailScreen />, queryClient);
    // Then
    expect(html).toContain("종료된 공지예요");
    expect(html).toContain("건물 안내 보기");
    expect(html).not.toContain("불러오지 못했어요");
  });
});

describe("my info (LF-09)", () => {
  it("offers move-out and logout from my info", () => {
    // Given
    const queryClient = client(me(occupancy(BUILDING_ID, "햇살빌라")));
    // When
    const html = render("/me", "/me", <MeScreen />, queryClient);
    // Then
    expect(html).toContain("이 건물에서 이사했어요");
    expect(html).not.toContain('id="me-move-soon"');
    expect(html).toContain("로그아웃");
  });

  it("asks to log in when signed out", () => {
    // Given
    const queryClient = client(null);
    // When
    const html = render("/me", "/me", <MeScreen />, queryClient);
    // Then
    expect(html).toContain("로그인이 필요해요");
    expect(html).toContain("카카오로 로그인");
  });
});

describe("notification choice (17)", () => {
  const actions: NotifyActions = {
    busy: false,
    error: undefined,
    onEnable: () => undefined,
    onDisable: () => undefined,
    onOpenExternal: () => undefined,
    onCopyLink: () => undefined,
    onClose: () => undefined,
  };
  const cases: Array<[PushEnv, string, string]> = [
    [{ kind: "available" }, "새 공지를 알림으로 받을까요?", "알림 받기"],
    [{ kind: "ios-install", safari: true }, "홈 화면에 추가한 뒤", "아래 공유 버튼 누르기"],
    [
      { kind: "in-app", app: "kakao" },
      "카카오톡 안에서는 알림을 켤 수 없어요",
      "Safari·Chrome으로 열기",
    ],
    [{ kind: "blocked", ios: false }, "지금 알림이 꺼져 있어요", "주소창 왼쪽 아이콘 누르기"],
    [
      { kind: "unsupported", reason: "server" },
      "공지는 우리 건물 화면에서 볼 수 있어요",
      "알림을 보내지 않고 있어요",
    ],
  ];

  it.each(cases)("shows the %o branch", (env, title, action) => {
    // Given
    const context = "connected";
    // When
    const html = renderToStaticMarkup(
      <NotifyChoiceBody env={env} context={context} actions={actions} />,
    );
    // Then
    expect(html).toContain(title);
    expect(html).toContain(action);
    expect(html).toContain("연결은 끝났어요");
  });

  it("offers turning off only from settings when notifications are on", () => {
    // Given
    const env: PushEnv = { kind: "enabled" };
    // When
    const settings = renderToStaticMarkup(
      <NotifyChoiceBody env={env} context="settings" actions={actions} />,
    );
    const connected = renderToStaticMarkup(
      <NotifyChoiceBody env={env} context="connected" actions={actions} />,
    );
    // Then
    expect(settings).toContain("이 휴대폰에서 알림 끄기");
    expect(settings).not.toContain("연결은 끝났어요");
    expect(connected).not.toContain("이 휴대폰에서 알림 끄기");
  });
});
