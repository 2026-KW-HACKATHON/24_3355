import { lazy, type RefObject, Suspense, useEffect, useRef, useState } from "react";
import { Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router";
import { useMe } from "../features/auth/queries";
import { readConnectedState } from "../features/occupancy/connectedState";
import { Splash } from "./Splash";

// 알림 선택 시트(17)는 연결을 마친 직후에만 필요해서 그때 불러옵니다(첫 화면 번들을 가볍게).
const ConnectedNotifyPrompt = lazy(() =>
  import("./ConnectedNotifyPrompt").then((module) => ({ default: module.ConnectedNotifyPrompt })),
);

// 약관 다시 동의 시트(D-28)도 지금 판에 동의하지 않은 로그인 사용자에게만 필요해서 그때 불러옵니다.
const TermsConsentPrompt = lazy(() =>
  import("../features/auth/TermsConsentSheet").then((module) => ({
    default: module.TermsConsentPrompt,
  })),
);

/** 로그인했지만 지금 판 약관에 동의하지 않았으면 시트를 붙이고, 동의한 뒤에도 닫히는 동안은 둡니다. */
function useTermsPromptMounted(): boolean {
  const me = useMe();
  const [mounted, setMounted] = useState(false);
  if (!mounted && me.data && !me.data.user.termsUpToDate) setMounted(true);
  return mounted;
}

const HEADING = "main h1, header h1";
/** 불러오는 화면(main[aria-busy])이 끝나기를 이만큼만 기다립니다. */
const SETTLE_TIMEOUT_MS = 15_000;

function focusTarget(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(HEADING) ?? document.querySelector<HTMLElement>("main")
  );
}

/** 포커스가 사라졌거나(지운 요소·body) 제목 대신 main에 있으면 옮겨도 됩니다. 사용자가 고른 곳은 두고 갑니다. */
function focusIsFree(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected || active.tagName === "MAIN";
}

/**
 * 화면이 바뀌면 새 화면의 h1로 포커스를 옮깁니다(interaction.md §3). 첫 진입은 건드리지 않습니다.
 * 불러오는 중인 틀(`main[aria-busy]`)이 내용으로 바뀌면 포커스한 요소가 사라지므로, 이 이동마다
 * 한 번 불러오기가 끝난 뒤의 h1로 다시 옮깁니다.
 */
function useFocusHeadingOnNavigate(root: RefObject<HTMLDivElement | null>) {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // 페이지가 바뀌었다는 것만 알리면 되므로 경로를 읽어 둡니다.
    void pathname;
    let observer: MutationObserver | undefined;
    let timer: number | undefined;
    const settled = () =>
      document.querySelector('main[aria-busy="true"]') === null &&
      document.querySelector(HEADING) !== null;
    const frame = requestAnimationFrame(() => {
      focusTarget()?.focus({ preventScroll: true });
      const container = root.current;
      if (settled() || !container) return;
      observer = new MutationObserver(() => {
        if (!settled()) return;
        observer?.disconnect();
        window.clearTimeout(timer);
        if (focusIsFree()) focusTarget()?.focus({ preventScroll: true });
      });
      observer.observe(container, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["aria-busy"],
      });
      timer = window.setTimeout(() => observer?.disconnect(), SETTLE_TIMEOUT_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.clearTimeout(timer);
    };
  }, [pathname, root]);
}

/** service worker가 보낸 경로. 같은 출처의 경로만 받습니다. */
export function readNavigateMessage(data: unknown, origin: string): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const { type, path } = data as Record<string, unknown>;
  if (type !== "wh:navigate" || typeof path !== "string" || !path.startsWith("/")) return undefined;
  try {
    const url = new URL(path, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 알림을 눌렀을 때 이미 열린 창이면 service worker(public/sw.js)가 경로를 보냅니다. 창을 새로 읽지 않고
 * 라우터로 옮겨서 쓰던 입력이 있으면 나가기 확인(LeaveConfirm)을 거치게 합니다. 받았다고 답하지 않으면
 * service worker가 창 주소를 직접 바꿉니다.
 */
function useServiceWorkerNavigate() {
  const navigate = useNavigate();
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    const onMessage = (event: MessageEvent) => {
      const path = readNavigateMessage(event.data, window.location.origin);
      if (!path) return;
      void navigate(path);
      event.ports[0]?.postMessage("ok");
    };
    container.addEventListener("message", onMessage);
    container.startMessages();
    return () => container.removeEventListener("message", onMessage);
  }, [navigate]);
}

export function RootLayout() {
  const root = useRef<HTMLDivElement>(null);
  useFocusHeadingOnNavigate(root);
  useServiceWorkerNavigate();
  const { state } = useLocation();
  const termsPrompt = useTermsPromptMounted();
  const connected = readConnectedState(state);
  return (
    <div className="wh-app" ref={root}>
      <Outlet />
      {connected ? (
        <Suspense fallback={null}>
          <ConnectedNotifyPrompt />
        </Suspense>
      ) : null}
      {/* 저절로 뜨는 다른 시트(17·40·돌아온 메모)와 겹치지 않게 약관 시트는 맨 뒤 차례를 기다립니다(components/autoSheet). */}
      {termsPrompt ? (
        <Suspense fallback={null}>
          <TermsConsentPrompt />
        </Suspense>
      ) : null}
      <Splash />
      <ScrollRestoration />
    </div>
  );
}

/** 화면 코드를 처음 불러오는 동안의 빈 틀(깜빡임 없이 흰 화면). */
export function BlankScreen() {
  return <div className="wh-app" aria-busy="true" />;
}
