import { type RefObject, useEffect } from "react";

/** CSS 시간 토큰(".3s"·"300ms")을 ms로. 읽지 못하면 0. */
function tokenMs(name: string): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  return raw.endsWith("ms") ? value : value * 1000;
}

/**
 * 입력이 있는 시트(12·25)를 열면 올라오는 애니메이션(SEED 시트 나타남 d6)이 끝난 뒤 입력칸에 포커스를 둡니다
 * (interaction.md §4). SEED `BottomSheet.Root`의 `onAnimationEnd`는 시트가 스스로 열고 닫을 때만 불려서
 * `open` prop으로 연 시트에서는 오지 않습니다. 동작 줄이기에서는 애니메이션이 없으므로 바로 둡니다.
 */
export function useSheetAutoFocus(open: boolean, target: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      () => target.current?.focus({ preventScroll: true }),
      reduce ? 0 : tokenMs("--seed-duration-d6"),
    );
    return () => window.clearTimeout(timer);
  }, [open, target]);
}

/**
 * 입력칸에 포커스가 가면 SEED 시트는 키보드에 맞추려고 그 순간의 높이를 인라인 px로 고정하고, 입력칸이 사라진 채
 * 키보드가 닫히지 않으면 풀지 않습니다. 같은 시트에서 내용을 바꿀 때(12 → 13 메모를 남긴 뒤) 그 고정을 풀어
 * 바뀐 내용 높이에 맞춥니다(아래 버튼이 화면 밖으로 잘리지 않게).
 */
export function releaseSheetHeight(content: HTMLElement | null) {
  if (!content) return;
  content.style.removeProperty("height");
  content.style.removeProperty("min-height");
}
