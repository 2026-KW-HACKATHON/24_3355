import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  Guide,
  GuideCorrectionMemo,
  ManagedBuildingDetail,
  ManagedBuildingSummary,
  ManagedCorrectionMemo,
  Me,
  MeOccupancy,
  PublicBuilding,
} from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Component as BuildingRoute } from "../app/BuildingRoute";
import { authKeys } from "../features/auth/queries";
import { buildingKeys } from "../features/buildings/queries";
import { memoKeys } from "../features/guides/memos";
import { guideKeys } from "../features/guides/queries";
import { noticeKeys } from "../features/notices/queries";
import { reportKeys } from "../features/reports/queries";
import { tipKeys } from "../features/tips/queries";
import { AppError } from "../lib/errors";
import { testUser } from "../test/me";
import { memoryStorage } from "../test/memoryStorage";
import { Component as GuideDetailScreen } from "./guide-detail/route";
import { Component as LandlordHomeScreen } from "./landlord-home/route";
import { Component as MeScreen } from "./me/route";
import { Component as MemoReviewScreen } from "./memo-review/route";
import { Component as MoveOutDoneScreen } from "./move-out-done/route";
import { Component as ResidentHomeScreen } from "./resident-home/route";

// C(정보 유지)·D(교체) 화면의 첫 상태를 서버 렌더로 봅니다. 요청은 보내지 않고 캐시에 넣은 값으로 그립니다.
// 쓰던 내용을 지키는 화면(useBlocker)이 있어 데이터 라우터(createMemoryRouter)로 그립니다.
vi.mock("@seed-design/react", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
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

const BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
const GUIDE_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f11";
const MEMO_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f51";

const building: PublicBuilding = {
  id: BUILDING_ID,
  name: "햇살빌라",
  displayAddress: "서울 노원구 월계동 OO길",
  status: "open",
};
const guide: Guide = {
  id: GUIDE_ID,
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

function occupancy(overrides: Partial<MeOccupancy> = {}): MeOccupancy {
  return {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f41",
    buildingId: BUILDING_ID,
    buildingName: "햇살빌라",
    status: "active",
    connectedAt: "2026-03-02T01:00:00.000Z",
    lastReconfirmedAt: null,
    nextReconfirmAt: "2027-03-02T01:00:00.000Z",
    reconfirmRequested: false,
    reconfirmDueAt: "2027-03-16T01:00:00.000Z",
    endedAt: null,
    ...overrides,
  };
}

function me(occ: MeOccupancy | null, managed = false): Me {
  return {
    user: testUser("5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99"),
    managedBuildings: managed ? [{ id: BUILDING_ID, name: "햇살빌라" }] : [],
    occupancy: occ,
  };
}

function memo(overrides: Partial<GuideCorrectionMemo> = {}): GuideCorrectionMemo {
  return {
    id: MEMO_ID,
    guideId: GUIDE_ID,
    body: "재활용 수거일이 월·목으로 바뀌었어요.",
    status: "pending",
    keptReason: null,
    createdAt: "2026-09-20T01:00:00.000Z",
    resolvedAt: null,
    mine: true,
    ...overrides,
  };
}

function client(meData: Me | null, extra: (queryClient: QueryClient) => void = () => undefined) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  queryClient.setQueryData(authKeys.me(), meData);
  queryClient.setQueryData(authKeys.demo(), false);
  queryClient.setQueryData(buildingKeys.public(BUILDING_ID), building);
  queryClient.setQueryData(buildingKeys.guides(BUILDING_ID), { guides: [guide] });
  queryClient.setQueryData(noticeKeys.list(BUILDING_ID), { notices: [] });
  queryClient.setQueryData(guideKeys.detail(GUIDE_ID), guide);
  extra(queryClient);
  return queryClient;
}

function failWith(queryClient: QueryClient, queryKey: readonly unknown[], error: AppError) {
  queryClient
    .getQueryCache()
    .build(queryClient, { queryKey: [...queryKey] })
    .setState({ status: "error", error, fetchStatus: "idle" });
}

function render(
  path: string,
  route: string,
  element: ReactNode,
  queryClient: QueryClient,
  state?: unknown,
) {
  const router = createMemoryRouter([{ path: route, element }], {
    initialEntries: [{ pathname: path, state }],
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
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

describe("guide detail memos (LF-02 11·12·44)", () => {
  const path = `/b/${BUILDING_ID}/guides/${GUIDE_ID}`;
  const route = "/b/:buildingId/guides/:guideId";

  it("shows the resident's memo results with the kept reason", () => {
    // Given
    const queryClient = client(me(occupancy()), (qc) =>
      qc.setQueryData(memoKeys.guide(GUIDE_ID), {
        memos: [
          memo({ id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f53", mine: false }),
          memo({
            status: "kept",
            keptReason: "수거일은 그대로예요",
            resolvedAt: "2026-09-21T01:00:00.000Z",
          }),
        ],
      }),
    );
    // When
    const html = render(path, route, <GuideDetailScreen />, queryClient);
    // Then
    expect(html).toContain("메모 남기기");
    expect(html).toContain("이 안내에 남긴 메모");
    expect(html).toContain("내 메모");
    expect(html).toContain("기존 유지");
    expect(html).toContain("사유: 수거일은 그대로예요");
    expect(html).toContain("집주인 확인 전");
    expect(html.indexOf("내 메모")).toBeLessThan(html.indexOf("거주자 메모"));
  });

  it("keeps reconfirm_needed residents read-only with a way to confirm", () => {
    // Given
    const queryClient = client(
      me(occupancy({ status: "reconfirm_needed", reconfirmRequested: true })),
      (qc) => qc.setQueryData(memoKeys.guide(GUIDE_ID), { memos: [memo()] }),
    );
    // When
    const html = render(path, route, <GuideDetailScreen />, queryClient);
    // Then
    expect(html).toContain("거주 확인이 필요해요");
    expect(html).toContain("거주 확인");
    expect(html).not.toContain("메모 남기기");
    expect(html).toContain("재활용 수거일이 월·목으로 바뀌었어요.");
  });

  it("does not show an empty memo list when loading memos failed", () => {
    // Given
    const queryClient = client(me(occupancy()), (qc) =>
      failWith(qc, memoKeys.guide(GUIDE_ID), new AppError("NETWORK")),
    );
    // When
    const html = render(path, route, <GuideDetailScreen />, queryClient);
    // Then
    expect(html).toContain("남긴 메모를 불러오지 못했어요");
    expect(html).toContain("다시 시도");
  });

  it("offers a retry instead of the connect sheet when my info failed to load", () => {
    // Given: /api/me가 연결 문제로 실패
    const queryClient = client(null, (qc) => {
      qc.removeQueries({ queryKey: authKeys.me() });
      failWith(qc, authKeys.me(), new AppError("NETWORK"));
    });
    // When
    const html = render(path, route, <GuideDetailScreen />, queryClient);
    // Then
    expect(html).toContain("내 정보를 불러오지 못했어요");
    expect(html).toContain("다시 시도");
    expect(html).not.toContain("메모 남기기");
  });

  it("offers the landlord editing instead of a memo", () => {
    // Given
    const queryClient = client(me(null, true));
    // When
    const html = render(path, route, <GuideDetailScreen />, queryClient);
    // Then
    expect(html).toContain("안내 고치기");
    expect(html).not.toContain("메모 남기기");
  });

  it("shows no memos to visitors (they get the connect sheet on tap)", () => {
    // Given
    const queryClient = client(null);
    // When
    const html = render(path, route, <GuideDetailScreen />, queryClient);
    // Then
    expect(html).toContain("메모 남기기");
    expect(html).not.toContain("이 안내에 남긴 메모");
  });
});

describe("reconfirm (LF-09 40)", () => {
  const path = `/b/${BUILDING_ID}`;
  const route = "/b/:buildingId";

  it("puts a banner on top of the home while the request is open", () => {
    // Given
    const queryClient = client(me(occupancy({ reconfirmRequested: true })));
    // When
    const html = render(path, route, <ResidentHomeScreen />, queryClient);
    // Then
    expect(html).toContain("아직 햇살빌라에 살고 있나요?");
    expect(html).toContain("답하기");
    expect(html).toContain("거주 중");
  });

  it("says writing and notifications are paused when reconfirm is needed", () => {
    // Given
    const queryClient = client(
      me(occupancy({ status: "reconfirm_needed", reconfirmRequested: true })),
    );
    // When
    const html = render(path, route, <ResidentHomeScreen />, queryClient);
    // Then
    expect(html).toContain("거주 확인이 필요해요");
    expect(html).toContain("확인하기");
    expect(html).toContain("거주 확인 필요");
  });

  it("shows no banner for a settled connection", () => {
    // Given
    const queryClient = client(me(occupancy()));
    // When
    const html = render(path, route, <ResidentHomeScreen />, queryClient);
    // Then
    expect(html).not.toContain("rh-reconfirm");
  });
});

describe("my info (LF-09 45)", () => {
  it("opens move-out and reconfirm from the residence group", () => {
    // Given
    const queryClient = client(me(occupancy({ reconfirmRequested: true })));
    // When
    const html = render("/me", "/me", <MeScreen />, queryClient);
    // Then
    expect(html).toContain("이 건물에서 이사했어요");
    expect(html).toContain("지금 확인");
    expect(html).toContain("거주 확인 요청");
    expect(html).not.toContain('id="me-move-soon"');
  });

  it("pauses notifications for reconfirm_needed instead of offering to turn them on", () => {
    // Given
    const queryClient = client(me(occupancy({ status: "reconfirm_needed" })));
    // When
    const html = render("/me", "/me", <MeScreen />, queryClient);
    // Then
    expect(html).toContain("거주 확인 뒤 다시 켤 수 있어요");
    expect(html).toContain("멈춤");
  });

  it("shows a landlord without a connection their building instead of resident copy", () => {
    // Given
    const queryClient = client(me(null, true));
    // When
    const html = render("/me", "/me", <MeScreen />, queryClient);
    // Then
    expect(html).toContain("집주인으로 관리하는 건물이에요");
    expect(html).not.toContain("현관 QR로 우리 건물을 열고");
  });
});

describe("move-out done (LF-09 09)", () => {
  it("ends membership and points to what stays in the building", () => {
    // Given
    const queryClient = client(me(occupancy()));
    const state = { moved: { buildingId: BUILDING_ID, buildingName: "햇살빌라" } };
    // When
    const html = render("/me/moved", "/me/moved", <MoveOutDoneScreen />, queryClient, state);
    // Then
    expect(html).toContain("햇살빌라와의 연결을 마쳤어요");
    expect(html).toContain("기본 안내 1개");
    expect(html).toContain("wh-hami");
    // 버튼은 할 일을 말합니다(interaction.md §9). 이사한 뒤라 ‘우리 건물’이 아닙니다
    expect(html).toContain(">건물 화면으로<");
    expect(html).not.toContain("우리 건물 화면으로");
  });

  it("counts only my tips that stay visible in the building", () => {
    // Given: 내가 남긴 팁 둘 중 하나는 운영팀이 가림
    const tip = {
      id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f71",
      buildingId: BUILDING_ID,
      buildingName: "햇살빌라",
      category: "parcel" as const,
      body: "택배는 선반에",
      createdMonth: "2026-09",
      mine: true,
      hidden: false,
      editable: false,
    };
    const queryClient = client(me(occupancy()), (qc) => {
      qc.setQueryData(tipKeys.mine(me(null).user.id), {
        tips: [tip, { ...tip, id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f72", hidden: true }],
      });
    });
    const state = { moved: { buildingId: BUILDING_ID, buildingName: "햇살빌라" } };
    // When
    const html = render("/me/moved", "/me/moved", <MoveOutDoneScreen />, queryClient, state);
    // Then
    expect(html).toContain("내가 남긴 팁 1개도");
  });
});

describe("landlord home (LF-13 42·24)", () => {
  const path = `/manage/${BUILDING_ID}`;
  const route = "/manage/:buildingId";
  const detail: ManagedBuildingDetail = {
    building: {
      ...building,
      fullAddress: "서울 노원구 월계동 OO길 12",
      openedAt: "2026-03-16T01:00:00.000Z",
      confirmedAt: "2026-03-15T01:00:00.000Z",
    },
    guides: [guide],
  };
  const summary = (pendingMemoCount: number): ManagedBuildingSummary => ({
    ...detail.building,
    publishedGuideCount: 1,
    draftGuideCount: 0,
    pendingMemoCount,
    newReportCount: 0,
    tipCount: 0,
  });
  const managedMemo: ManagedCorrectionMemo = {
    id: MEMO_ID,
    guideId: GUIDE_ID,
    body: "재활용 수거일이 월·목으로 바뀌었어요.",
    status: "pending",
    keptReason: null,
    createdAt: "2026-09-20T01:00:00.000Z",
    resolvedAt: null,
    guideTitle: guide.title,
    guideCategory: "recycling",
  };

  function landlordClient(memos: ManagedCorrectionMemo[]) {
    return client(me(null, true), (qc) => {
      qc.setQueryData(buildingKeys.managed(BUILDING_ID), detail);
      qc.setQueryData(buildingKeys.managedList(), { buildings: [summary(memos.length)] });
      qc.setQueryData(memoKeys.building(BUILDING_ID, "pending"), { memos });
      qc.setQueryData(noticeKeys.audience(BUILDING_ID), { connectedCount: 2, subscribedCount: 1 });
    });
  }

  it("puts 확인할 것 first when memos are waiting (24)", () => {
    // Given
    const queryClient = landlordClient([managedMemo]);
    // When
    const html = render(path, route, <LandlordHomeScreen />, queryClient);
    // Then
    expect(html).toContain("확인할 것");
    expect(html).toContain("안내 수정 메모 1건");
    expect(html).toContain(`/manage/${BUILDING_ID}/memos/${MEMO_ID}`);
    expect(html).toContain("세입자 화면으로 보기");
    expect(html.indexOf("확인할 것")).toBeLessThan(html.indexOf("지금 건물에 보이는 것"));
  });

  it("puts 이어서 할 것 right after 지금 보이는 것 when nothing is waiting (42)", () => {
    // Given
    const queryClient = landlordClient([]);
    // When
    const html = render(path, route, <LandlordHomeScreen />, queryClient);
    // Then
    expect(html).not.toContain(">확인할 것<");
    expect(html).toContain("아직 확인할 것은 없어요");
    expect(html.indexOf('id="lh-todo"')).toBeGreaterThan(html.indexOf('id="lh-visible"'));
    expect(html.indexOf('id="lh-todo"')).toBeLessThan(html.indexOf('id="lh-guides"'));
  });

  it("follows the summary when no new reports are left, not an old cached list", () => {
    // Given: 예전에 받아 둔 ‘새 제보’ 목록이 캐시에 남아 있지만 요약은 0건
    const queryClient = landlordClient([]);
    queryClient.setQueryData(reportKeys.building(BUILDING_ID, "received"), {
      reports: [{ id: "old" }, { id: "older" }],
    });
    // When
    const html = render(path, route, <LandlordHomeScreen />, queryClient);
    // Then
    expect(html).not.toContain("받은 상황");
    expect(html).toContain("아직 확인할 것은 없어요");
  });
});

describe("memo review (LF-17 25)", () => {
  const path = `/manage/${BUILDING_ID}/memos/${MEMO_ID}`;
  const route = "/manage/:buildingId/memos/:memoId";
  const detail: ManagedBuildingDetail = {
    building: {
      ...building,
      fullAddress: "서울 노원구 월계동 OO길 12",
      openedAt: null,
      confirmedAt: null,
    },
    guides: [guide],
  };
  const base: ManagedCorrectionMemo = {
    id: MEMO_ID,
    guideId: GUIDE_ID,
    body: "재활용 수거일이 월·목으로 바뀌었어요.",
    status: "pending",
    keptReason: null,
    createdAt: "2026-09-20T01:00:00.000Z",
    resolvedAt: null,
    guideTitle: guide.title,
    guideCategory: "recycling",
  };

  function reviewClient(memoValue: ManagedCorrectionMemo) {
    return client(me(null, true), (qc) => {
      qc.setQueryData(buildingKeys.managed(BUILDING_ID), detail);
      qc.setQueryData(memoKeys.detail(MEMO_ID), memoValue);
      qc.setQueryData(memoKeys.building(BUILDING_ID, "pending"), { memos: [memoValue] });
    });
  }

  it("compares the guide with the memo and links 반영 to editing with the memo selected", () => {
    // Given
    const queryClient = reviewClient(base);
    // When
    const html = render(path, route, <MemoReviewScreen />, queryClient);
    // Then
    expect(html).toContain("지금 안내");
    expect(html).toContain("작성자 비공개");
    expect(html).toContain("기존 안내 유지");
    expect(html).toContain(`/manage/${BUILDING_ID}/guides/${GUIDE_ID}/edit?apply=${MEMO_ID}`);
  });

  it("shows the result instead of actions once someone kept it", () => {
    // Given
    const queryClient = reviewClient({
      ...base,
      status: "kept",
      keptReason: "수거일은 그대로예요",
      resolvedAt: "2026-09-21T01:00:00.000Z",
    });
    // When
    const html = render(path, route, <MemoReviewScreen />, queryClient);
    // Then
    expect(html).toContain("사유: 수거일은 그대로예요");
    expect(html).toContain("관리 홈으로");
    expect(html).not.toContain("안내에 반영");
  });
});

describe("building address split (LF-01·05)", () => {
  it("shows the public screen when /api/me fails instead of loading forever", async () => {
    // Given
    const queryClient = client(null, (qc) =>
      failWith(qc, authKeys.me(), new AppError("INTERNAL_ERROR")),
    );
    const router = createMemoryRouter([{ path: "/b/:buildingId", element: <BuildingRoute /> }], {
      initialEntries: [`/b/${BUILDING_ID}`],
    });
    // When
    const { prelude } = await prerender(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    const html = await new Response(prelude).text();
    // Then
    expect(html).toContain("햇살빌라");
    expect(html).toContain("새 공지를 알림으로 받으려면");
    expect(html).not.toContain("건물 안내를 불러오는 중");
  });

  it("reads ?via=qr once and shows the front-door badge on the public screen only", async () => {
    // Given
    const render = async (meData: Me | null, entry: string) => {
      const router = createMemoryRouter([{ path: "/b/:buildingId", element: <BuildingRoute /> }], {
        initialEntries: [entry],
      });
      const { prelude } = await prerender(
        <QueryClientProvider client={client(meData)}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );
      return new Response(prelude).text();
    };
    // When
    const visitor = await render(null, `/b/${BUILDING_ID}?via=qr`);
    const shared = await render(null, `/b/${BUILDING_ID}`);
    const resident = await render(me(occupancy()), `/b/${BUILDING_ID}?via=qr`);
    // Then
    expect(visitor).toContain("현관 QR</span>");
    expect(shared).not.toContain("현관 QR</span>");
    expect(resident).toContain("거주 중");
    expect(resident).not.toContain("현관 QR</span>");
  });
});
