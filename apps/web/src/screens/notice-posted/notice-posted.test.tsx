import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ManagedBuildingDetail, Notice } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authKeys } from "../../features/auth/queries";
import { buildingKeys } from "../../features/buildings/queries";
import { noticeKeys } from "../../features/notices/queries";
import { pushKeys } from "../../features/push/queries";
import { testUser } from "../../test/me";
import { Component as NoticePostedScreen } from "./route";

vi.mock("@seed-design/react", () => ({
  ActionButton: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  Skeleton: () => <span />,
  Snackbar: { AvoidOverlap: ({ children }: { children?: ReactNode }) => children },
  useSnackbarAdapter: () => ({ create: () => undefined }),
}));

const BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f03";
const NOTICE_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f51";

const detail: ManagedBuildingDetail = {
  building: {
    id: BUILDING_ID,
    name: "테스트빌라",
    displayAddress: "서울 노원구 월계동 OO길",
    status: "open",
    fullAddress: "서울 노원구 월계동 1-1",
    openedAt: "2026-03-01T00:00:00.000Z",
    confirmedAt: "2026-03-01T00:00:00.000Z",
  },
  guides: [],
};

const notice: Notice = {
  id: NOTICE_ID,
  buildingId: BUILDING_ID,
  title: "단수 안내",
  body: "오전 9시부터 12시까지",
  startsAt: "2026-10-01T00:00:00.000Z",
  endsAt: "2026-10-02T00:00:00.000Z",
  publishedAt: "2026-09-30T00:00:00.000Z",
};

function render(attemptedCount: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  queryClient.setQueryData(authKeys.me(), {
    user: testUser("5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99"),
    managedBuildings: [{ id: BUILDING_ID, name: "테스트빌라" }],
    occupancy: null,
  });
  queryClient.setQueryData(buildingKeys.managed(BUILDING_ID), detail);
  queryClient.setQueryData(noticeKeys.detail(NOTICE_ID), notice);
  queryClient.setQueryData(pushKeys.publicKey(), { publicKey: "BExample" });
  const path = `/manage/${BUILDING_ID}/notices/${NOTICE_ID}`;
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: path, state: { attemptedCount } }]}>
        <Routes>
          <Route path="/manage/:buildingId/notices/:noticeId" element={<NoticePostedScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// 공지 링크는 지금 연 주소의 출처로 만듭니다(lib/share.ts). node에는 window가 없습니다.
beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notice posted (LF-15 37)", () => {
  it("says how many the push was tried for, without promising delivery", () => {
    const html = render(3);
    expect(html).toContain("알림 대상 3명에게 발송을 시도했어요");
    expect(html).toContain("알림을 받지 않는 분에게도 같은 링크로");
  });

  it("does not report ‘0명’ when nobody has turned notifications on yet", () => {
    const html = render(0);
    expect(html).not.toContain("0명에게");
    expect(html).toContain("아직 알림을 켠 거주자가 없어요");
    expect(html).toContain("알림을 받지 않는 분에게도 같은 링크로");
  });
});
