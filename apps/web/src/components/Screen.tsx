import type { ElementType, ReactNode } from "react";
import { useNavigate } from "react-router";
import { setLargeMode, useLargeMode } from "../lib/largeMode";
import { Icon } from "./Icon";

/** 화면 한 장: 상단 막대 + 본문(main) + 하단 고정 버튼. */
export function Screen({
  topbar,
  dock,
  tone = "white",
  children,
  busy = false,
}: {
  topbar?: ReactNode;
  dock?: ReactNode;
  tone?: "white" | "gray";
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className={tone === "gray" ? "wh-screen wh-screen--gray" : "wh-screen"}>
      {topbar}
      <main className="wh-screen__body" tabIndex={-1} aria-busy={busy || undefined}>
        {children}
      </main>
      {dock}
    </div>
  );
}

export function TopBar({
  start,
  title,
  titleAs = "span",
  end,
}: {
  start?: ReactNode;
  title?: ReactNode;
  titleAs?: ElementType;
  end?: ReactNode;
}) {
  const Title = titleAs;
  return (
    <header className="wh-topbar">
      <div className="wh-topbar__side">{start}</div>
      {title ? (
        <Title className="wh-topbar__title" tabIndex={titleAs === "h1" ? -1 : undefined}>
          {title}
        </Title>
      ) : (
        <span />
      )}
      <div className="wh-topbar__side wh-topbar__side--end">{end}</div>
    </header>
  );
}

export function Brand() {
  return (
    <span className="wh-brand">
      <span className="wh-brand__stamp">
        <Icon name="moon" />
      </span>
      월계함
    </span>
  );
}

/** 앱 안에서 들어왔으면 뒤로, 주소로 바로 열었으면 `fallback`으로 갑니다. */
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate(fallback, { replace: true });
  };
}

export function BackButton({
  fallback,
  label = "뒤로",
  icon = "chevron-left",
}: {
  fallback: string;
  label?: string;
  icon?: "chevron-left" | "x";
}) {
  const goBack = useGoBack(fallback);
  return (
    <button type="button" className="wh-icon-btn" aria-label={label} onClick={goBack}>
      <Icon name={icon} />
    </button>
  );
}

/** 크게 보기(lofi 28). 누르면 바로 바뀌고 이 브라우저에 기억합니다. */
export function LargeModeToggle() {
  const large = useLargeMode();
  return (
    <button
      type="button"
      className="wh-pill-btn"
      aria-label="크게 보기"
      aria-pressed={large}
      onClick={() => setLargeMode(!large)}
    >
      <span className="wh-pill-btn__face">
        <Icon name="type" />
        {large ? "크게 보기 켜짐" : "크게 보기"}
      </span>
    </button>
  );
}

export function Dock({
  hint,
  error,
  children,
}: {
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="wh-dock">
      {error ? (
        <p className="wh-dock__error" role="alert">
          {error}
        </p>
      ) : null}
      {hint ? <p className="wh-dock__hint">{hint}</p> : null}
      {children}
    </div>
  );
}

/** 아직 열지 않은 기능의 이유. 비활성 버튼의 aria-describedby로 연결합니다. */
export function SoonNote({ id, children }: { id?: string; children?: ReactNode }) {
  return (
    <span className="wh-soon" id={id}>
      <Icon name="clock" />
      {children ?? "다음 업데이트에서 열려요"}
    </span>
  );
}
