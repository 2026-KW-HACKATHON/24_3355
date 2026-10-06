import { MutationObserver, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type DemoOverview, type Me, type MeOccupancy, TERMS_VERSION } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authKeys, demoLoginMutationOptions } from "../../features/auth/queries";
import { getJson, postJson } from "../../lib/api";
import { AppError } from "../../lib/errors";
import { testUser } from "../../test/me";
import { memoryStorage } from "../../test/memoryStorage";
import {
  demoDestination,
  demoKey,
  demoResetMutationOptions,
  demoRoles,
  fetchDemoOverview,
  guestReportRef,
  resetErrorMessage,
  roleSubtitle,
  waitText,
} from "./demo";
import { Component as DemoScreen } from "./route";

vi.mock("../../lib/api", () => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
  postEmpty: vi.fn(),
  sendJsonEmpty: vi.fn(),
  http: { get: vi.fn() },
}));

// SEED 컴포넌트는 CSS를 함께 불러와 node에서 읽을 수 없어, 글자와 disabled만 남기는 대역으로 바꿉니다.
vi.mock("@seed-design/react", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Root = ({ open, children }: { open?: boolean; children?: ReactNode }) =>
    open ? children : null;
  return {
    ActionButton: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) => (
      <button type="button" disabled={disabled}>
        {children}
      </button>
    ),
    Skeleton: () => <span />,
    Portal: Pass,
    Dialog: {
      Root,
      Positioner: Pass,
      Backdrop: Pass,
      Content: Pass,
      Header: Pass,
      Title: Pass,
      Description: Pass,
      Footer: Pass,
    },
    Snackbar: { AvoidOverlap: ({ children }: { children?: ReactNode }) => children },
  };
});

const SUNNY = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
const SPRING = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f02";
const TEST_VILLA = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f03";

function occupancy(buildingId: string, buildingName: string): MeOccupancy {
  return {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f41",
    buildingId,
    buildingName,
    status: "active",
    connectedAt: "2026-09-01T01:00:00.000Z",
    lastReconfirmedAt: null,
    nextReconfirmAt: "2027-09-01T01:00:00.000Z",
    reconfirmRequested: false,
    reconfirmDueAt: "2027-09-15T01:00:00.000Z",
    endedAt: null,
  };
}

const GUEST_REPORT = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f61";
const overview: DemoOverview = {
  guestReport: { reportId: GUEST_REPORT, statusPath: `/r/${GUEST_REPORT}#t=demo-guest-token` },
  buildings: [
    {
      id: SUNNY,
      name: "햇살빌라",
      status: "open",
      confirmedAt: null,
      purpose: "demo",
      joinCode: "WK72P4",
    },
    {
      id: SPRING,
      name: "새봄하우스",
      status: "preparing",
      confirmedAt: null,
      purpose: "demo",
      joinCode: null,
    },
    {
      id: TEST_VILLA,
      name: "테스트빌라",
      status: "open",
      confirmedAt: null,
      purpose: "e2e",
      joinCode: null,
    },
  ],
  accounts: [
    {
      as: "demo-landlord",
      label: "집주인",
      role: "landlord",
      purpose: "demo",
      buildings: [{ id: SUNNY, name: "햇살빌라" }],
      pendingMemoCount: 2,
      newReportCount: 1,
    },
    {
      as: "demo-resident-b",
      label: "다음 입주자 B",
      role: "resident",
      purpose: "demo",
      occupancy: null,
      tipCount: 0,
      memoCount: 0,
    },
    {
      as: "demo-resident-a",
      label: "입주자 A",
      role: "resident",
      purpose: "demo",
      occupancy: occupancy(SUNNY, "햇살빌라"),
      tipCount: 1,
      memoCount: 1,
    },
    {
      as: "demo-e2e-landlord",
      label: "테스트빌라 집주인",
      role: "landlord",
      purpose: "e2e",
      buildings: [{ id: TEST_VILLA, name: "테스트빌라" }],
      pendingMemoCount: 0,
      newReportCount: 0,
    },
  ],
};

function me(overrides: Partial<Me> = {}): Me {
  return { user: testUser("user-x"), managedBuildings: [], occupancy: null, ...overrides };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
});

afterEach(() => {
  vi.mocked(getJson).mockReset();
  vi.mocked(postJson).mockReset();
  vi.unstubAllGlobals();
});

describe("demo roles (LF-20 29)", () => {
  it("lists the lofi roles in order and hides the e2e accounts", () => {
    // When
    const labels = demoRoles(overview).map((role) =>
      role.kind === "guest" ? "옆 건물 주민" : role.account.label,
    );
    // Then
    expect(labels).toEqual(["입주자 A", "옆 건물 주민", "집주인", "다음 입주자 B"]);
  });

  it("hides the neighbour card when there is no seeded guest report", () => {
    // When
    const roles = demoRoles({ ...overview, guestReport: null });
    const odd = demoRoles({
      ...overview,
      guestReport: { reportId: GUEST_REPORT, statusPath: "https://elsewhere.example/r/x" },
    });
    // Then
    expect(roles.some((role) => role.kind === "guest")).toBe(false);
    expect(odd.some((role) => role.kind === "guest")).toBe(false);
  });

  it("describes each role from the response, not fixed numbers", () => {
    const [a, guest, landlord, b] = demoRoles(overview);
    if (!a || !guest || !landlord || !b) throw new Error("roles missing");
    expect(roleSubtitle(a, overview)).toBe("거주 중 · 팁 1개 · 메모 1개");
    expect(roleSubtitle(guest, overview)).toBe("비회원 · 보낸 제보 1건");
    expect(roleSubtitle(landlord, overview)).toBe("햇살빌라 · 확인할 것 3건");
    expect(roleSubtitle(b, overview)).toBe("아직 연결 전 · 가입코드 WK72P4");
  });

  it("writes the neighbour's report status when it has been read (lofi 29)", () => {
    const guest = demoRoles(overview).find((role) => role.kind === "guest");
    if (!guest) throw new Error("guest missing");
    expect(roleSubtitle(guest, overview, "received")).toBe("비회원 · 제보 1건 접수됨");
    expect(roleSubtitle(guest, overview, "acknowledged")).toBe("비회원 · 제보 1건 확인함");
    expect(roleSubtitle(guest, overview, "completed")).toBe("비회원 · 제보 1건 처리 완료");
    expect(guestReportRef(overview)).toEqual({ reportId: GUEST_REPORT, token: "demo-guest-token" });
    expect(
      guestReportRef({
        ...overview,
        guestReport: { reportId: GUEST_REPORT, statusPath: `/r/${GUEST_REPORT}` },
      }),
    ).toBeUndefined();
  });

  it("opens the right first screen for each role", () => {
    const [a, guest, landlord, b] = demoRoles(overview);
    if (!a || !guest || !landlord || !b) throw new Error("roles missing");
    // 집주인 → 관리 홈, 입주자 A → 거주자 홈(같은 /b/:id), 연결 전 B·비회원 → 연결할 수 있는 공개 화면
    expect(
      demoDestination(
        landlord,
        me({ managedBuildings: [{ id: SUNNY, name: "햇살빌라" }] }),
        overview,
      ),
    ).toBe(`/manage/${SUNNY}`);
    expect(demoDestination(a, me({ occupancy: occupancy(SUNNY, "햇살빌라") }), overview)).toBe(
      `/b/${SUNNY}`,
    );
    expect(demoDestination(b, me(), overview)).toBe(`/b/${SUNNY}`);
    // 비회원 → 보낸 제보의 상태(확인 링크)
    expect(demoDestination(guest, null, overview)).toBe(`/r/${GUEST_REPORT}#t=demo-guest-token`);
    // B가 시연 중 다른 건물에 연결했으면 그 건물의 거주자 홈
    expect(
      demoDestination(b, me({ occupancy: occupancy(TEST_VILLA, "테스트빌라") }), overview),
    ).toBe(`/b/${TEST_VILLA}`);
  });

  it("switches role through the demo login with the terms version", async () => {
    // Given
    const queryClient = new QueryClient();
    const next = me({ managedBuildings: [{ id: SUNNY, name: "햇살빌라" }] });
    vi.mocked(postJson).mockResolvedValue(next);
    queryClient.setQueryData(["manage", "buildings"], { from: "previous account" });
    // When
    await new MutationObserver(queryClient, demoLoginMutationOptions(queryClient)).mutate({
      as: "demo-landlord",
      consent: TERMS_VERSION,
    });
    // Then
    expect(vi.mocked(postJson).mock.calls[0]?.slice(0, 2)).toEqual([
      "/api/dev/login",
      { as: "demo-landlord", consent: TERMS_VERSION },
    ]);
    expect(queryClient.getQueryData(authKeys.me())).toEqual(next);
    expect(queryClient.getQueryData(["manage", "buildings"])).toBeUndefined();
  });
});

describe("demo reset (처음 상태로)", () => {
  function seeded() {
    const queryClient = new QueryClient();
    queryClient.setQueryData(authKeys.me(), me());
    queryClient.setQueryData(demoKey, overview);
    queryClient.setQueryData(["building", SUNNY], { name: "햇살빌라" });
    queryClient.setQueryData(["manage", "buildings", SUNNY], { name: "햇살빌라" });
    localStorage.setItem(`wh.visited.${SUNNY}`, "1");
    localStorage.setItem("wh.visited.5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99", "1");
    sessionStorage.setItem("wh.connect", "{}");
    return queryClient;
  }

  it("clears cached building data and this device's demo traces after a reset", async () => {
    // Given
    const queryClient = seeded();
    // 서버는 되돌린 발표 시연 건물만 돌려줍니다(e2e 건물은 그대로).
    vi.mocked(postJson).mockResolvedValue({ buildings: [{ id: SUNNY, name: "햇살빌라" }] });
    // When
    await new MutationObserver(queryClient, demoResetMutationOptions(queryClient)).mutate();
    // Then
    expect(vi.mocked(postJson).mock.calls[0]?.slice(0, 2)).toEqual(["/api/dev/reset", {}]);
    expect(queryClient.getQueryData(["building", SUNNY])).toBeUndefined();
    expect(queryClient.getQueryData(["manage", "buildings", SUNNY])).toBeUndefined();
    expect(queryClient.getQueryState(authKeys.me())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(demoKey)?.isInvalidated).toBe(true);
    expect(localStorage.getItem(`wh.visited.${SUNNY}`)).toBeNull();
    expect(localStorage.getItem("wh.visited.5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99")).toBe("1");
    expect(sessionStorage.getItem("wh.connect")).toBeNull();
  });

  it("keeps everything and says how long to wait when the reset is rate limited", async () => {
    // Given
    const queryClient = seeded();
    vi.mocked(postJson).mockRejectedValue(new AppError("RATE_LIMITED", { retryAfterSeconds: 25 }));
    // When
    const error = await new MutationObserver(queryClient, demoResetMutationOptions(queryClient))
      .mutate()
      .catch((caught: unknown) => caught);
    // Then
    expect(resetErrorMessage(error)).toBe("조금 전에 되돌렸어요. 25초 뒤에 다시 할 수 있어요");
    expect(queryClient.getQueryData(["building", SUNNY])).toEqual({ name: "햇살빌라" });
    expect(localStorage.getItem(`wh.visited.${SUNNY}`)).toBe("1");
  });

  it("turns Retry-After into minutes when it is long", () => {
    expect(waitText(undefined)).toBe("잠시 뒤에");
    expect(waitText(30)).toBe("30초 뒤에");
    expect(waitText(600)).toBe("10분 뒤에");
  });
});

describe("/demo outside demo mode", () => {
  it("reads a missing demo API as not demo mode", async () => {
    vi.mocked(getJson).mockRejectedValue(new AppError("NOT_FOUND"));
    await expect(fetchDemoOverview()).resolves.toBeNull();
  });

  it("shows the not-found screen instead of the demo start", () => {
    // Given
    const queryClient = new QueryClient();
    queryClient.setQueryData(demoKey, null);
    // When
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/demo"]}>
          <DemoScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Then
    expect(html).toContain("건물 정보를 찾을 수 없어요");
    expect(html).not.toContain("누구의 화면으로");
  });

  it("shows the demo banner and role cards in demo mode", () => {
    // Given
    const queryClient = new QueryClient();
    queryClient.setQueryData(demoKey, overview);
    queryClient.setQueryData(authKeys.me(), null);
    // When
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/demo"]}>
          <DemoScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Then
    expect(html).toContain("시연용 데이터");
    expect(html).toContain("시연용 주소예요. 햇살빌라·새봄하우스의 가상 데이터만 쓰고");
    expect(html).toContain("누구의 화면으로");
    expect(html).toContain("다음 입주자 B");
    expect(html).not.toContain("테스트빌라 집주인");
    expect(html).toContain("시연 초기화");
  });
});
