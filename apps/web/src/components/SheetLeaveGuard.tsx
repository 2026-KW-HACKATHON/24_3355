import { useEffect } from "react";
import { type Blocker, useBlocker } from "react-router";
import { isLeaveOk } from "./leaveOk";

/**
 * 입력이 있는 시트가 열린 채 뒤로 가기로 화면을 떠나려 할 때 막고 `onBlocked`로 알립니다(frontend.md §4).
 * 시트는 대화상자를 겹치지 않고 자기 안에서 ‘지우고 나가기’(`proceed`)·‘계속 쓰기’(`reset`)를 묻습니다.
 * 쓰던 내용이 있을 때만 그려 두세요. 보내기에 성공해 이동할 때는 state에 `LEAVE_OK`를 넣습니다.
 */
export function SheetLeaveGuard({ onBlocked }: { onBlocked: (blocker: Blocker) => void }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname && !isLeaveOk(nextLocation.state),
  );
  useEffect(() => {
    if (blocker.state === "blocked") onBlocked(blocker);
  }, [blocker, onBlocked]);
  return null;
}
