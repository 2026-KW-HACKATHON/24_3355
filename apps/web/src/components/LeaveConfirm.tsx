import { ActionButton, Dialog, Portal } from "@seed-design/react";
import { useBlocker } from "react-router";
import { isLeaveOk } from "./leaveOk";

export { isLeaveOk, LEAVE_OK } from "./leaveOk";

/**
 * 쓰던 내용이 있을 때 화면을 떠나려 하면(닫기·뒤로 가기) 한 번 확인합니다(interaction.md §4).
 * `when`이 false이거나 이동 state에 `LEAVE_OK`가 있으면 막지 않습니다.
 */
export function LeaveConfirm({
  when,
  title,
  description,
}: {
  when: boolean;
  title: string;
  description: string;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname && !isLeaveOk(nextLocation.state),
  );
  const open = blocker.state === "blocked";
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && blocker.state === "blocked") blocker.reset();
      }}
    >
      <Portal>
        <Dialog.Positioner>
          <Dialog.Backdrop />
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </Dialog.Header>
            <Dialog.Footer>
              <div className="wh-btn-row wh-leave">
                <ActionButton
                  className="wh-btn wh-btn--neutral"
                  size="large"
                  variant="neutralWeak"
                  onClick={() => blocker.reset?.()}
                >
                  계속 쓰기
                </ActionButton>
                <ActionButton
                  className="wh-btn"
                  size="large"
                  variant="criticalSolid"
                  onClick={() => blocker.proceed?.()}
                >
                  나가기
                </ActionButton>
              </div>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
