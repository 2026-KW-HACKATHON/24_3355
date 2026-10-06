import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Me } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { SignedInGate } from "../features/auth/ManagerGate";
import { authKeys } from "../features/auth/queries";
import { AppError } from "../lib/errors";
import { testUser } from "../test/me";
import { Component as InviteScreen } from "./landlord-invite/route";
import { Component as RootScreen } from "./root/route";

// 서버 렌더로 첫 화면만 봅니다. 요청은 보내지 않고 캐시에 넣은 상태로 그립니다.
// SEED 컴포넌트는 CSS를 함께 불러와 node에서 읽을 수 없어, 글자만 남기는 대역으로 바꿉니다.
vi.mock("@seed-design/react", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  // 로그인 동의 시트는 로그인 버튼을 누를 때만 열리므로 첫 화면에는 그리지 않습니다.
  const Root = ({ open, children }: { open?: boolean; children?: ReactNode }) =>
    open ? children : null;
  return {
    ActionButton: ({ children }: { children?: ReactNode }) => (
      <button type="button">{children}</button>
    ),
    Skeleton: () => <span />,
    Portal: Pass,
    BottomSheet: {
      Root,
      Positioner: Pass,
      Backdrop: Pass,
      Content: Pass,
      Handle: Pass,
      Body: Pass,
      Title: Pass,
    },
    // 하단 버튼·탭은 토스트가 가리지 않게 Snackbar.AvoidOverlap으로 감쌉니다(components/Screen.tsx).
    Snackbar: { AvoidOverlap: ({ children }: { children?: ReactNode }) => children },
    useSnackbarAdapter: () => ({ create: () => undefined }),
  };
});

type MeState = { data: Me | null } | { error: AppError };

function client(me: MeState, demoAvailable = true) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  const cache = queryClient.getQueryCache();
  if ("error" in me) {
    cache.build(queryClient, { queryKey: authKeys.me() }).setState({
      status: "error",
      error: me.error,
      fetchStatus: "idle",
    });
  } else {
    queryClient.setQueryData(authKeys.me(), me.data);
  }
  queryClient.setQueryData(authKeys.demo(), demoAvailable);
  queryClient.setQueryData(["invite", "preview", "invite-token"], { buildingName: "햇살빌라" });
  return queryClient;
}

function render(node: ReactNode, path: string, me: MeState) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client(me)}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("root screen and /api/me", () => {
  it("shows the QR guide when signed out (401)", () => {
    // Given
    const me = { data: null };
    // When
    const html = render(<RootScreen />, "/", me);
    // Then
    expect(html).toContain("현관 QR로 우리 건물을 열어 주세요");
    expect(html).not.toContain("불러오지 못했어요");
  });

  it("shows a retry instead of the signed-out screen when /api/me fails", () => {
    // Given
    const me = { error: new AppError("NETWORK") };
    // When
    const html = render(<RootScreen />, "/", me);
    // Then
    expect(html).toContain("불러오지 못했어요");
    expect(html).toContain("다시 시도");
    expect(html).not.toContain("현관 QR로 우리 건물을 열어 주세요");
  });
});

describe("invite screen", () => {
  it("offers Kakao login only, without the demo login, when signed out", () => {
    // Given
    const me = { data: null };
    // When
    const html = render(<InviteScreen />, "/invite#t=invite-token", me);
    // Then
    expect(html).toContain("햇살빌라 관리자로 초대받았어요");
    expect(html).toContain("카카오로 시작하기");
    expect(html).not.toContain("시연용 집주인으로 들어가기");
  });

  it("asks to retry instead of showing login when /api/me fails", () => {
    // Given
    const me = { error: new AppError("INTERNAL_ERROR") };
    // When
    const html = render(<InviteScreen />, "/invite#t=invite-token", me);
    // Then
    expect(html).toContain("다시 시도");
    expect(html).toContain("잠시 문제가 생겼어요");
    expect(html).not.toContain("카카오로 시작하기");
  });

  it("shows the accept button when signed in", () => {
    // Given
    const me = {
      data: {
        user: testUser("5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f02"),
        managedBuildings: [],
        occupancy: null,
      },
    };
    // When
    const html = render(<InviteScreen />, "/invite#t=invite-token", me);
    // Then
    expect(html).toContain("초대 수락하고 시작하기");
  });
});

describe("manager login screen", () => {
  it("keeps the demo login outside the invite flow", () => {
    // Given
    const me = { data: null };
    // When
    const html = render(<SignedInGate>{() => null}</SignedInGate>, "/manage", me);
    // Then
    expect(html).toContain("카카오로 로그인");
    expect(html).toContain("시연용 집주인으로 들어가기");
  });
});
