import { useEffect, useRef } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";

/** 화면이 바뀌면 새 화면의 h1로 포커스를 옮깁니다(interaction.md §3). 첫 진입은 건드리지 않습니다. */
function useFocusHeadingOnNavigate() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // 페이지가 바뀌었다는 것만 알리면 되므로 경로를 읽어 둡니다.
    void pathname;
    const frame = requestAnimationFrame(() => {
      const target =
        document.querySelector<HTMLElement>("main h1, header h1") ??
        document.querySelector<HTMLElement>("main");
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
}

export function RootLayout() {
  useFocusHeadingOnNavigate();
  return (
    <div className="wh-app">
      <Outlet />
      <ScrollRestoration />
    </div>
  );
}

/** 화면 코드를 처음 불러오는 동안의 빈 틀(깜빡임 없이 흰 화면). */
export function BlankScreen() {
  return <div className="wh-app" aria-busy="true" />;
}
