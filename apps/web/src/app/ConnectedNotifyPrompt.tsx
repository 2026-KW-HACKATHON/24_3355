import { useLocation, useNavigate } from "react-router";
import { useAutoSheetTurn } from "../components/autoSheet";
import { readConnectedState } from "../features/occupancy/connectedState";
import { NotifyChoiceSheet } from "../features/push/NotifyChoiceSheet";

/**
 * 연결을 마치고 돌아온 화면 위에 알림 선택(17)을 한 번 띄웁니다. 돌아온 곳이 어느 화면이든 같습니다.
 * 닫으면 history state에 표시해 새로고침·뒤로 가기로 다시 뜨지 않게 합니다.
 */
export function ConnectedNotifyPrompt() {
  const location = useLocation();
  const navigate = useNavigate();
  const connected = readConnectedState(location.state);
  const wants = connected?.first === true && connected.notifyAsked !== true;
  // 다른 자동 시트(약관 등)가 떠 있으면 닫힌 뒤에 뜹니다.
  const turn = useAutoSheetTurn("notify-connected", wants);

  if (!connected) return null;
  return (
    <NotifyChoiceSheet
      open={wants && turn}
      context="connected"
      onOpenChange={(next) => {
        if (next) return;
        void navigate(
          { pathname: location.pathname, search: location.search, hash: location.hash },
          {
            replace: true,
            preventScrollReset: true,
            state: { connected: { ...connected, notifyAsked: true } },
          },
        );
      }}
    />
  );
}
