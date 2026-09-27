import { useSyncExternalStore } from "react";

// 크게 보기(lofi 28): <html data-size="large">. 저장이 안 돼도 이번 방문에는 적용합니다.
const KEY = "wh.size";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "large";
  } catch {
    return false; // 비공개 모드·저장소 차단
  }
}

function apply(large: boolean) {
  if (large) document.documentElement.dataset["size"] = "large";
  else delete document.documentElement.dataset["size"];
}

/** 첫 그리기 전에 부릅니다(main.tsx). 저장된 설정을 html에 반영합니다. */
export function initLargeMode() {
  apply(read());
}

export function isLargeMode(): boolean {
  return document.documentElement.dataset["size"] === "large";
}

export function setLargeMode(large: boolean) {
  apply(large);
  try {
    if (large) localStorage.setItem(KEY, "large");
    else localStorage.removeItem(KEY);
  } catch {
    // 저장하지 못해도 화면에는 적용된 상태로 둡니다.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLargeMode(): boolean {
  return useSyncExternalStore(subscribe, isLargeMode, () => false);
}
