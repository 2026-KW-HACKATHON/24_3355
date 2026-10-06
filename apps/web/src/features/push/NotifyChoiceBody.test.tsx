import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { type NotifyActions, NotifyChoiceBody } from "./NotifyChoiceSheet";

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

const actions: NotifyActions = {
  busy: false,
  error: undefined,
  onEnable: () => undefined,
  onDisable: () => undefined,
  onOpenExternal: () => undefined,
  onCopyLink: () => undefined,
  onClose: () => undefined,
};

describe("notification choice (17) states", () => {
  it("waits for the server key instead of offering a button that would fail", () => {
    // When
    const html = renderToStaticMarkup(
      <NotifyChoiceBody env={undefined} context="settings" actions={actions} />,
    );
    // Then
    expect(html).toContain("알림 환경을 확인하는 중이에요");
    expect(html).not.toContain("알림 받기");
    expect(html).toContain('role="status"');
  });

  it("keeps 나중에 pressable while the browser permission prompt is open", () => {
    // When
    const html = renderToStaticMarkup(
      <NotifyChoiceBody
        env={{ kind: "available" }}
        context="connected"
        actions={{ ...actions, busy: true, closeLocked: false }}
      />,
    );
    // Then
    const later = html.slice(html.lastIndexOf("<button", html.indexOf("나중에")));
    expect(later.slice(0, later.indexOf(">"))).not.toContain("disabled");
  });

  it("locks closing only while saving to the server", () => {
    // When
    const html = renderToStaticMarkup(
      <NotifyChoiceBody
        env={{ kind: "available" }}
        context="connected"
        actions={{ ...actions, busy: true, closeLocked: true }}
      />,
    );
    // Then
    const later = html.slice(html.lastIndexOf("<button", html.indexOf("나중에")));
    expect(later.slice(0, later.indexOf(">"))).toContain("disabled");
  });
});
