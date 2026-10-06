import { useEffect, useSyncExternalStore } from "react";

// 누르지 않아도 저절로 뜨는 시트(연결 뒤 알림 선택 17, 재확인 40, 돌아온 메모 12, 약관 다시 동의)는 한 번에
// 하나만 보여줍니다(interaction.md §4). 먼저 차례를 받은 시트가 닫힐 때까지 나머지는 기다리고, 약관 시트처럼
// `last`로 부탁한 시트는 기다리는 다른 시트가 모두 끝난 뒤에 뜹니다. 이미 떠 있는 시트를 밀어내지 않습니다.

/** 앞 시트가 닫히는 움직임(SEED d6 안팎)이 끝난 뒤에 다음 시트를 올립니다. */
export const AUTO_SHEET_GAP_MS = 350;
/** 이보다 짧게 떠 있던 차례(StrictMode의 한 번 붙였다 떼기 등)는 닫히는 움직임이 없으므로 기다리지 않습니다. */
const SHOWN_MS = 100;

type Waiting = { id: string; last: boolean };

export function createAutoSheetQueue({
  gapMs = AUTO_SHEET_GAP_MS,
  now = () => Date.now(),
}: {
  gapMs?: number;
  now?: () => number;
} = {}) {
  let waiting: Waiting[] = [];
  let active: string | null = null;
  let activeSince = 0;
  let gap: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  function pick() {
    if (active !== null || gap !== undefined) return;
    const next = waiting.find((item) => !item.last) ?? waiting[0];
    if (!next) return;
    active = next.id;
    activeSince = now();
    emit();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** 지금 차례인 시트 id. 없으면 null. */
    active: () => active,
    /** 뜨고 싶다고 알립니다. 같은 id를 여러 번 불러도 한 번만 기다립니다. */
    request(id: string, last = false) {
      if (active === id || waiting.some((item) => item.id === id)) return;
      waiting.push({ id, last });
      pick();
    },
    /** 닫혔거나 더 뜰 필요가 없으면 차례를 돌려줍니다. */
    release(id: string) {
      waiting = waiting.filter((item) => item.id !== id);
      if (active !== id) return;
      active = null;
      emit();
      if (now() - activeSince < SHOWN_MS) {
        pick();
        return;
      }
      gap = setTimeout(() => {
        gap = undefined;
        pick();
      }, gapMs);
    },
  };
}

const queue = createAutoSheetQueue();

/**
 * 저절로 뜨는 시트의 차례. `wants`가 true인 동안 줄을 서고, 차례가 오면 true를 돌려줍니다. 시트의 `open`에
 * `wants && 차례`를 넘기고, 닫히면(`wants` false) 다음 시트에 차례가 넘어갑니다. 사용자가 직접 연 시트에는 쓰지
 * 않습니다(누르는 동안 다른 자동 시트는 화면을 덮고 있지 않음).
 */
export function useAutoSheetTurn(id: string, wants: boolean, { last = false } = {}): boolean {
  useEffect(() => {
    if (!wants) return;
    queue.request(id, last);
    return () => queue.release(id);
  }, [id, wants, last]);
  const active = useSyncExternalStore(queue.subscribe, queue.active, queue.active);
  return wants && active === id;
}
