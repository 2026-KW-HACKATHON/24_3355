import {
  QueryClient as Client,
  type QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type {
  Guide,
  ManagedBuildingDetail,
  ManagedReport,
  Me,
  MeOccupancy,
  MyTip,
  PublicBuilding,
  Report,
  ReportDetail,
  Tip,
} from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authKeys } from "../features/auth/queries";
import { buildingKeys } from "../features/buildings/queries";
import { memoKeys } from "../features/guides/memos";
import { reportKeys } from "../features/reports/queries";
import { REPORT_SENT_STATE } from "../features/reports/sentState";
import { tipKeys } from "../features/tips/queries";
import { AppError } from "../lib/errors";
import { testUser } from "../test/me";
import { memoryStorage } from "../test/memoryStorage";
import { Component as InboxScreen } from "./landlord-inbox/route";
import { Component as MeScreen } from "./me/route";
import { Component as MyTipsScreen } from "./my-tips/route";
import { Component as PublicBuildingScreen } from "./public-building/route";
import { Component as ReportStatusScreen } from "./report-status/route";
import { Component as SentReportsScreen } from "./sent-reports/route";
import { Component as TipWriteScreen } from "./tip-write/route";
import { Component as TipsScreen } from "./tips/route";

// 서버 렌더로 첫 화면만 봅니다. 요청은 보내지 않고 캐시에 넣은 상태로 그립니다(slice-b-states.test.tsx와 같은 방식).
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
    Dialog: { ...Parts, Title: Pass, Description: Pass, Footer: Pass },
    // 하단 버튼·탭은 토스트가 가리지 않게 Snackbar.AvoidOverlap으로 감쌉니다(components/Screen.tsx).
    Snackbar: { AvoidOverlap: ({ children }: { children?: ReactNode }) => children },
    useSnackbarAdapter: () => ({ create: () => undefined }),
  };
});

const BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f03";
const REPORT_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f51";
const USER_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99";
const TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

const report: Report = {
  id: REPORT_ID,
  buildingId: BUILDING_ID,
  buildingName: "테스트빌라",
  preset: "trash_overflow",
  kind: "trash",
  location: null,
  body: null,
  status: "received",
  resultNote: null,
  createdAt: "2026-09-25T06:12:00.000Z",
  acknowledgedAt: null,
  resolvedAt: null,
};

function detail(extra: Partial<ReportDetail> = {}): ReportDetail {
  return {
    ...report,
    viewer: "reporter",
    reporterKind: null,
    accessExpiresAt: "2026-10-25T06:12:00.000Z",
    ...extra,
  };
}

function occupancy(status: MeOccupancy["status"] = "active"): MeOccupancy {
  return {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f41",
    buildingId: BUILDING_ID,
    buildingName: "테스트빌라",
    status,
    connectedAt: "2026-03-02T01:00:00.000Z",
    lastReconfirmedAt: null,
    nextReconfirmAt: "2027-03-02T01:00:00.000Z",
    reconfirmRequested: false,
    reconfirmDueAt: "2027-03-16T01:00:00.000Z",
    endedAt: null,
  };
}

function me(occ: MeOccupancy | null, managed = false): Me {
  return {
    user: testUser(USER_ID),
    managedBuildings: managed ? [{ id: BUILDING_ID, name: "테스트빌라" }] : [],
    occupancy: occ,
  };
}

function client(meData: Me | null, extra: (queryClient: QueryClient) => void = () => undefined) {
  const queryClient = new Client({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  queryClient.setQueryData(authKeys.me(), meData);
  queryClient.setQueryData(authKeys.demo(), false);
  extra(queryClient);
  return queryClient;
}

/** 요청 없이 실패한 query를 캐시에 둡니다. */
function failQuery(queryClient: QueryClient, queryKey: readonly unknown[], error: AppError) {
  queryClient
    .getQueryCache()
    .build(queryClient, { queryKey })
    .setState({ status: "error", error, fetchStatus: "idle", errorUpdatedAt: Date.now() });
}

function render(
  entry: { pathname: string; hash?: string; state?: unknown },
  route: string,
  element: ReactNode,
  queryClient: QueryClient,
) {
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
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

describe("report status (LF-11, /r/:reportId)", () => {
  const route = "/r/:reportId";
  const pathname = `/r/${REPORT_ID}`;

  it("shows the received screen with the envelope right after sending, and keeps the link", () => {
    // Given
    const queryClient = client(null, (qc) => {
      qc.setQueryData(reportKeys.detail(REPORT_ID, TOKEN), detail());
    });
    // When
    const html = render(
      { pathname, hash: `#t=${TOKEN}`, state: { [REPORT_SENT_STATE]: { stored: true } } },
      route,
      <ReportStatusScreen />,
      queryClient,
    );
    // Then
    expect(html).toContain("내용을 접수했어요");
    expect(html).toContain("집주인은 아직 확인 전이에요.");
    expect(html).toContain("<img");
    expect(html).toContain("이 브라우저에서 다시 보기");
    expect(html).toContain("본인만 보관해 주세요");
    expect(html).toContain("링크 복사");
    expect(html).toContain("카카오톡으로 공유");
    expect(html).not.toContain(TOKEN);
  });

  it("warns louder when the token could not be stored in this browser", () => {
    // Given
    const queryClient = client(null, (qc) => {
      qc.setQueryData(reportKeys.detail(REPORT_ID, TOKEN), detail());
    });
    // When
    const html = render(
      { pathname, hash: `#t=${TOKEN}`, state: { [REPORT_SENT_STATE]: { stored: false } } },
      route,
      <ReportStatusScreen />,
      queryClient,
    );
    // Then
    expect(html).toContain("이 브라우저에 저장하지 못했어요");
    expect(html).not.toContain("같은 브라우저로 QR을 다시 열면 보여요");
  });

  it("shows the result instead of 06 when the landlord already moved it on", () => {
    // Given: 보낸 직후의 history state가 남아 있지만 집주인이 처리 완료로 표시함
    const done = detail({
      status: "completed",
      acknowledgedAt: "2026-09-25T08:40:00.000Z",
      resolvedAt: "2026-09-26T00:10:00.000Z",
    });
    const queryClient = client(null, (qc) => {
      qc.setQueryData(reportKeys.detail(REPORT_ID, TOKEN), done);
    });
    // When
    const html = render(
      { pathname, hash: `#t=${TOKEN}`, state: { [REPORT_SENT_STATE]: { stored: false } } },
      route,
      <ReportStatusScreen />,
      queryClient,
    );
    // Then
    expect(html).toContain("집주인이 처리 완료로");
    expect(html).not.toContain("내용을 접수했어요");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("이 브라우저에 저장하지 못했어요");
    expect(html).toContain("건물로 돌아가기");
  });

  it("shows what the landlord marked and their one line, without Hami", () => {
    // Given
    const done = detail({
      status: "completed",
      acknowledgedAt: "2026-09-25T08:40:00.000Z",
      resolvedAt: "2026-09-26T00:10:00.000Z",
      resultNote: "청소하시는 분께 오늘 오전에 치워 달라고 전했어요.",
    });
    const queryClient = client(null, (qc) => {
      qc.setQueryData(reportKeys.detail(REPORT_ID, TOKEN), done);
    });
    // When
    const html = render(
      { pathname, hash: `#t=${TOKEN}` },
      route,
      <ReportStatusScreen />,
      queryClient,
    );
    // Then
    expect(html).toContain("집주인이 처리 완료로");
    expect(html).toContain("집주인이 남긴 말");
    expect(html).toContain("청소하시는 분께");
    expect(html).toContain("처리 완료는 집주인이 표시한");
    expect(html).toContain("건물로 돌아가기");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("해결됐어요");
  });

  it("uses the token kept in this browser when the link has no #t=", () => {
    // Given
    localStorage.setItem(
      "wh.reportAccess",
      JSON.stringify([
        {
          reportId: REPORT_ID,
          buildingId: BUILDING_ID,
          token: TOKEN,
          savedAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      ]),
    );
    const queryClient = client(null, (qc) => {
      qc.setQueryData(reportKeys.detail(REPORT_ID, TOKEN), detail({ status: "acknowledged" }));
    });
    // When
    const html = render({ pathname }, route, <ReportStatusScreen />, queryClient);
    // Then
    expect(html).toContain("집주인이 확인했어요");
  });

  it("says the link expired as a screen state", () => {
    // Given
    const queryClient = client(null, (qc) => {
      failQuery(qc, reportKeys.detail(REPORT_ID, TOKEN), new AppError("REPORT_LINK_EXPIRED"));
    });
    // When
    const html = render(
      { pathname, hash: `#t=${TOKEN}` },
      route,
      <ReportStatusScreen />,
      queryClient,
    );
    // Then
    expect(html).toContain("보관 기간이 지나 더 이상 확인할 수 없어요");
  });

  it("explains a lost link and offers login for account reports", () => {
    // Given
    const queryClient = client(null, (qc) => {
      failQuery(qc, reportKeys.detail(REPORT_ID, null), new AppError("NOT_FOUND"));
    });
    // When
    const html = render({ pathname }, route, <ReportStatusScreen />, queryClient);
    // Then
    expect(html).toContain("이 브라우저에서는 이전에 보낸 내용을 찾을 수 없어요");
    expect(html).toContain("보관한 확인 링크를 열어 주세요.");
    expect(html).toContain("카카오로 로그인");
  });
});

describe("landlord inbox (LF-16)", () => {
  const managed: ManagedBuildingDetail = {
    building: {
      id: BUILDING_ID,
      name: "테스트빌라",
      displayAddress: "서울 노원구 월계동 OO길",
      status: "open",
      fullAddress: "서울 노원구 월계동 1-1",
      openedAt: "2026-03-01T00:00:00.000Z",
      confirmedAt: "2026-02-28T00:00:00.000Z",
    },
    guides: [],
  };
  const received: ManagedReport = { ...report, reporterKind: "guest" };
  const acknowledged: ManagedReport = {
    ...report,
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f52",
    preset: null,
    kind: "noise",
    body: "밤마다 웅웅거려요",
    status: "unable",
    reporterKind: "resident",
  };
  const member: ManagedReport = {
    ...report,
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f53",
    status: "acknowledged",
    reporterKind: "member",
  };

  it("lists reports with reporter kind and status in text", () => {
    // Given
    const queryClient = client(me(null, true), (qc) => {
      qc.setQueryData(buildingKeys.managed(BUILDING_ID), managed);
      qc.setQueryData(reportKeys.building(BUILDING_ID), {
        reports: [received, member, acknowledged],
      });
      qc.setQueryData(memoKeys.building(BUILDING_ID, "pending"), { memos: [] });
    });
    // When
    const html = render(
      { pathname: `/manage/${BUILDING_ID}/inbox` },
      "/manage/:buildingId/inbox",
      <InboxScreen />,
      queryClient,
    );
    // Then
    expect(html).toContain("확인할 것");
    expect(html).toContain("쓰레기·분리수거 · 비회원");
    expect(html).toContain("쓰레기·분리수거 · 회원");
    expect(html).toContain("소음 · 거주자");
    expect(html).toContain("접수됨");
    expect(html).toContain("확인함");
    expect(html).toContain("처리가 어려움");
    expect(html).toContain(`/manage/${BUILDING_ID}/reports/${REPORT_ID}`);
  });

  it("shows an empty state instead of the old placeholder", () => {
    // Given
    const queryClient = client(me(null, true), (qc) => {
      qc.setQueryData(buildingKeys.managed(BUILDING_ID), managed);
      qc.setQueryData(reportKeys.building(BUILDING_ID), { reports: [] });
    });
    // When
    const html = render(
      { pathname: `/manage/${BUILDING_ID}/inbox` },
      "/manage/:buildingId/inbox",
      <InboxScreen />,
      queryClient,
    );
    // Then
    expect(html).toContain("아직 받은 내용이 없어요");
    expect(html).not.toContain("다음 업데이트에서 열려요");
  });
});

describe("tips (LF-06)", () => {
  const route = "/b/:buildingId/tips";
  const pathname = `/b/${BUILDING_ID}/tips`;
  const mine: Tip = {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f71",
    buildingId: BUILDING_ID,
    category: "recycling",
    body: "택배 상자는 펼쳐서 내놓아요.",
    createdMonth: "2026-09",
    mine: true,
  };
  const other: Tip = {
    ...mine,
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f72",
    category: "parcel",
    body: "비 오는 날 택배는 선반에 올려요.",
    createdMonth: "2026-05",
    mine: false,
  };

  it("marks only my tip, with edit/delete on mine and report on others", () => {
    // Given
    const queryClient = client(me(occupancy()), (qc) => {
      qc.setQueryData(tipKeys.building(BUILDING_ID, USER_ID), { tips: [mine, other] });
    });
    // When
    const html = render({ pathname }, route, <TipsScreen />, queryClient);
    // Then
    expect(html.match(/내 팁<\/span>/g)).toHaveLength(1);
    expect(html.match(/aria-label="내 팁 고치기·지우기"/g)).toHaveLength(1);
    expect(html.match(/aria-label="이 팁 신고하기"/g)).toHaveLength(1);
    expect(html).toContain("2026년 9월");
    expect(html).toContain("2026년 5월");
    expect(html).toContain("다른 거주자에게 작성자가 안 보여요");
    expect(html).toContain("생활 팁 남기기");
    expect(html).not.toContain("익명");
  });

  it("does not push to write when empty, and shows the empty tray", () => {
    // Given
    const queryClient = client(me(occupancy()), (qc) => {
      qc.setQueryData(tipKeys.building(BUILDING_ID, USER_ID), { tips: [] });
    });
    // When
    const html = render({ pathname }, route, <TipsScreen />, queryClient);
    // Then
    expect(html).toContain("아직 남겨진 팁이 없어요");
    expect(html).toContain("<img");
    expect(html.match(/생활 팁 남기기/g)).toHaveLength(1);
  });

  it("asks people who are not connected to connect first (44)", () => {
    // Given
    const queryClient = client(null);
    // When
    const html = render({ pathname }, route, <TipsScreen />, queryClient);
    // Then
    expect(html).toContain("생활 팁은 이 건물에 연결한 거주자가 볼 수 있어요");
    expect(html).toContain("returnTo=%2Fb%2F");
  });

  it("lets the landlord read and report but not write", () => {
    // Given
    const queryClient = client(me(null, true), (qc) => {
      qc.setQueryData(tipKeys.building(BUILDING_ID, USER_ID), { tips: [other] });
    });
    // When
    const html = render({ pathname }, route, <TipsScreen />, queryClient);
    // Then
    expect(html).toContain("이 팁 신고하기");
    expect(html).not.toContain("생활 팁 남기기");
  });

  it("keeps reading but stops writing while residence needs reconfirming", () => {
    // Given
    const queryClient = client(me(occupancy("reconfirm_needed")), (qc) => {
      qc.setQueryData(tipKeys.building(BUILDING_ID, USER_ID), { tips: [other] });
    });
    // When
    const html = render({ pathname }, route, <TipsScreen />, queryClient);
    // Then
    expect(html).toContain("거주 확인이 필요해서 지금은 팁을 남길 수 없어요");
    expect(html).not.toContain("생활 팁 남기기");
  });

  it("still says why writing is paused when there are no tips yet", () => {
    // Given
    const queryClient = client(me(occupancy("reconfirm_needed")), (qc) => {
      qc.setQueryData(tipKeys.building(BUILDING_ID, USER_ID), { tips: [] });
    });
    // When
    const html = render({ pathname }, route, <TipsScreen />, queryClient);
    // Then
    expect(html).toContain("아직 남겨진 팁이 없어요");
    expect(html).toContain("내 정보에서 거주 확인하기");
  });
});

describe("tip write (LF-07 19)", () => {
  const route = "/b/:buildingId/tips/new";
  const pathname = `/b/${BUILDING_ID}/tips/new`;

  it("offers 거주 확인 right there when residence needs reconfirming", () => {
    // Given
    const queryClient = client(me(occupancy("reconfirm_needed")));
    // When
    const html = render({ pathname }, route, <TipWriteScreen />, queryClient);
    // Then
    expect(html).toContain("거주 확인이 필요해서 지금은 팁을 남길 수 없어요");
    expect(html).toContain("거주 확인</button>");
    expect(html).not.toContain("남기기</button>");
  });

  it("fills the tip that was being written before logging in again, without sending", () => {
    // Given
    sessionStorage.setItem(
      "wh.tipDraft",
      JSON.stringify({
        buildingId: BUILDING_ID,
        tipId: null,
        category: "winter",
        body: "겨울엔 뒤편이 어두워요",
        savedAt: Date.now(),
      }),
    );
    const queryClient = client(me(occupancy()));
    // When: 쓰던 내용이 있으면 나가기 확인(useBlocker)이 붙어 데이터 라우터로 그립니다.
    const router = createMemoryRouter([{ path: route, element: <TipWriteScreen /> }], {
      initialEntries: [pathname],
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    // Then
    expect(html).toContain("겨울엔 뒤편이 어두워요</textarea>");
    expect(html).toMatch(/checked="" value="winter"/);
  });
});

describe("my pages (LF-08 · LF-09)", () => {
  it("labels hidden tips and tips from a building I left", () => {
    // Given
    const hidden: MyTip = {
      id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f73",
      buildingId: BUILDING_ID,
      buildingName: "테스트빌라",
      category: "winter",
      body: "가린 팁",
      createdMonth: "2025-12",
      mine: true,
      hidden: true,
      editable: true,
    };
    const moved: MyTip = {
      ...hidden,
      id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f74",
      buildingName: "새봄하우스",
      body: "이사한 건물의 팁",
      hidden: false,
      editable: false,
    };
    const queryClient = client(me(occupancy()), (qc) => {
      qc.setQueryData(tipKeys.mine(USER_ID), { tips: [hidden, moved] });
    });
    // When
    const html = render({ pathname: "/me/tips" }, "/me/tips", <MyTipsScreen />, queryClient);
    // Then
    expect(html).toContain("가려짐");
    expect(html).toContain("운영팀이 가려 다른 거주자에게 보이지 않아요");
    expect(html).toContain("이사한 건물의 팁이라 고치거나 지울 수 없어요");
    expect(html.match(/aria-label="내 팁 고치기·지우기"/g)).toHaveLength(1);
  });

  it("lists reports sent with this account", () => {
    // Given
    const queryClient = client(me(null), (qc) => {
      qc.setQueryData(reportKeys.mine(USER_ID), {
        reports: [
          { ...report, status: "acknowledged", acknowledgedAt: "2026-09-25T08:40:00.000Z" },
        ],
      });
    });
    // When
    const html = render(
      { pathname: "/me/reports" },
      "/me/reports",
      <SentReportsScreen />,
      queryClient,
    );
    // Then
    expect(html).toContain("쓰레기·분리수거 · 테스트빌라");
    expect(html).toContain("건물 앞 쓰레기가 넘쳤어요");
    expect(html).toContain("9월 25일 보냄 · 9월 25일 확인");
    expect(html).toContain(`/r/${REPORT_ID}`);
  });

  it("asks to log in before showing sent reports", () => {
    // Given
    const queryClient = client(null);
    // When
    const html = render(
      { pathname: "/me/reports" },
      "/me/reports",
      <SentReportsScreen />,
      queryClient,
    );
    // Then
    expect(html).toContain("로그인이 필요해요");
  });
});

describe("report entry on the building page (LF-01 · LF-10)", () => {
  const building: PublicBuilding = {
    id: BUILDING_ID,
    name: "테스트빌라",
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

  function withBuilding(qc: QueryClient) {
    qc.setQueryData(buildingKeys.public(BUILDING_ID), building);
    qc.setQueryData(buildingKeys.guides(BUILDING_ID), { guides: [guide] });
    qc.setQueryData(["building", BUILDING_ID, "notices"], { notices: [] });
    qc.setQueryData(reportKeys.lookup(BUILDING_ID), []);
  }

  it("opens the frequent phrases and writing for anyone, without the old 'soon' note", () => {
    // Given
    const queryClient = client(null, withBuilding);
    // When
    const html = render(
      { pathname: `/b/${BUILDING_ID}` },
      "/b/:buildingId",
      <PublicBuildingScreen />,
      queryClient,
    );
    // Then
    expect(html).toContain("건물 앞 쓰레기가 넘쳤어요");
    expect(html).toContain("통로를 막는 물건이 있어요");
    expect(html).toContain("물이 새거나 고장 났어요");
    expect(html).toContain(`href="/b/${BUILDING_ID}/report"`);
    expect(html).toContain("가입하지 않아도 보낼 수 있어요 · 집주인만 봐요");
    expect(html).not.toContain("알리기는 다음 업데이트에서 열려요");
    expect(html).not.toContain("disabled");
  });

  it("shows the front-door QR badge only when opened from the printed QR", () => {
    // Given: 주소 나누기(app/BuildingRoute)가 `?via=qr`을 읽어 넘깁니다(features/buildings/viaQr.test.ts)
    const plain = client(null, withBuilding);
    const viaQr = client(null, withBuilding);
    // When
    const withoutParam = render(
      { pathname: `/b/${BUILDING_ID}` },
      "/b/:buildingId",
      <PublicBuildingScreen />,
      plain,
    );
    const withParam = render(
      { pathname: `/b/${BUILDING_ID}` },
      "/b/:buildingId",
      <PublicBuildingScreen viaQr />,
      viaQr,
    );
    // Then
    expect(withoutParam).not.toContain("현관 QR</span>");
    expect(withParam).toContain("현관 QR</span>");
  });

  it("shows the ‘내가 보낸 내용’ banner from this browser's saved links", () => {
    // Given
    const queryClient = client(null, (qc) => {
      withBuilding(qc);
      qc.setQueryData(reportKeys.lookup(BUILDING_ID), [
        {
          report: {
            ...report,
            status: "completed",
            resolvedAt: "2026-09-26T00:10:00.000Z",
          },
          token: TOKEN,
        },
      ]);
    });
    // When
    const html = render(
      { pathname: `/b/${BUILDING_ID}` },
      "/b/:buildingId",
      <PublicBuildingScreen />,
      queryClient,
    );
    // Then
    expect(html).toContain("내가 보낸 내용 1건");
    expect(html).toContain("집주인이 처리 완료로 표시했어요 · 9월 26일");
    expect(html).toContain(`/r/${REPORT_ID}#t=${TOKEN}`);
  });
});

describe("my info rows (LF-09 45)", () => {
  it("links sent reports and my tips with counts", () => {
    // Given
    const queryClient = client(me(occupancy()), (qc) => {
      qc.setQueryData(reportKeys.mine(USER_ID), { reports: [report] });
      qc.setQueryData(tipKeys.mine(USER_ID), { tips: [] });
    });
    // When
    const html = render({ pathname: "/me" }, "/me", <MeScreen />, queryClient);
    // Then
    expect(html).toContain('href="/me/reports"');
    expect(html).toContain("1건");
    expect(html).toContain('href="/me/tips"');
    expect(html).toContain("0개");
    expect(html).not.toContain("다음 업데이트에서 열려요");
  });
});
