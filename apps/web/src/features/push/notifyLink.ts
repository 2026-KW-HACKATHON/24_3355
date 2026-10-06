import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAutoSheetTurn } from "../../components/autoSheet";

// 카카오톡 안 브라우저에서는 알림을 켤 수 없어 Safari·Chrome으로 엽니다(screens.md §6). 외부 브라우저는
// 로그인·저장소가 따로라서 연결 화면이 아니라 내 정보(45)를 열고, 로그인한 뒤 알림 선택(17)을 바로 띄웁니다.
export const NOTIFY_PARAM = "notify";
export const NOTIFY_PATH = `/me?${NOTIFY_PARAM}=1`;

export function hasNotifyParam(search: string): boolean {
  return new URLSearchParams(search).get(NOTIFY_PARAM) === "1";
}

/** 외부 브라우저로 열 주소(같은 출처의 내 정보 + 알림 선택). */
export function notifyLinkUrl(origin = window.location.origin): string {
  return `${origin}${NOTIFY_PATH}`;
}

/** `kakaotalk://web/openExternal`로 여는 주소. 실제 기기 동작은 확인 전입니다. */
export function kakaoOpenExternalUrl(url: string): string {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
}

/** 내 정보를 열 때 알림 선택 시트의 처음 상태. `?notify=1`이면 차례가 오면 저절로 엽니다(`auto`). */
export function initialNotifySheet(search: string): "auto" | "closed" {
  return hasNotifyParam(search) ? "auto" : "closed";
}

/**
 * 내 정보의 알림 선택 시트 열림 상태. 주소에 `?notify=1`이 있으면 열린 채로 시작하고, 닫으면 주소에서
 * 지워 새로고침해도 다시 뜨지 않게 합니다. `useState(false)` 자리에 그대로 씁니다. 주소로 저절로 여는 경우는
 * 다른 자동 시트(약관 등)와 겹치지 않게 차례를 기다립니다(components/autoSheet).
 */
export function useNotifySheetState(): [boolean, (open: boolean) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<"auto" | "open" | "closed">(() =>
    initialNotifySheet(location.search),
  );
  const turn = useAutoSheetTurn("notify-link", state === "auto");
  const open = state === "open" || (state === "auto" && turn);
  const { pathname, search, hash, state: historyState } = location;
  const change = useCallback(
    (next: boolean) => {
      setState(next ? "open" : "closed");
      if (next || !hasNotifyParam(search)) return;
      const params = new URLSearchParams(search);
      params.delete(NOTIFY_PARAM);
      const rest = params.toString();
      void navigate(
        { pathname, search: rest ? `?${rest}` : "", hash },
        { replace: true, preventScrollReset: true, state: historyState },
      );
    },
    [hash, navigate, pathname, search, historyState],
  );
  return [open, change];
}
