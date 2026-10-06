import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Me } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { authKeys } from "../../features/auth/queries";
import { testUser } from "../../test/me";
import { Component as RootScreen } from "./route";

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

function render(me: Me | null, path = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  queryClient.setQueryData(authKeys.me(), me);
  queryClient.setQueryData(authKeys.demo(), false);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <RootScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("first screen `/` (home screen app)", () => {
  it("offers Kakao login and my info when signed out, not a dead end", () => {
    // When
    const html = render(null);
    // Then
    expect(html).toContain("현관 QR로 우리 건물을 열어 주세요");
    expect(html).toContain("카카오로 로그인");
    expect(html).toContain('href="/me"');
  });

  it("keeps my info but no login button when signed in without a building", () => {
    // When
    const html = render({ user: testUser("user-a"), managedBuildings: [], occupancy: null });
    // Then
    expect(html).toContain('href="/me"');
    expect(html).not.toContain("카카오로 로그인");
  });

  it("shows the login result once, next to the login button", () => {
    // When
    const html = render(null, "/?login=failed");
    // Then
    expect(html.split("로그인하지 못했어요").length - 1).toBe(1);
  });
});
