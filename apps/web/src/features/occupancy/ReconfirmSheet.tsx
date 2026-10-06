import { ActionButton, BottomSheet, Portal } from "@seed-design/react";
import { useQueryClient } from "@tanstack/react-query";
import type { MeOccupancy } from "@wolgyeham/contracts";
import { useRef, useState } from "react";
import { Hami } from "../../components/Hami";
import { useToast } from "../../components/useToast";
import { errorMessage, toAppError } from "../../lib/errors";
import { formatDay } from "../../lib/format";
import { LoginAgainButton } from "../auth/LoginAgainButton";
import { authKeys } from "../auth/queries";
import { useReconfirm } from "./queries";
import { reconfirmState } from "./reconfirm";
import "./occupancy-sheets.css";

// LF-09 거주 재확인 · lofi 40. 홈 위 배너·내 정보·안내 상세(재확인 필요)에서 엽니다.
// ‘이사했어요’는 이 시트를 닫고 이사 확인(08)을 엽니다(`onMoveOut`).
export function ReconfirmSheet({
  open,
  onOpenChange,
  occupancy,
  onMoveOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occupancy: MeOccupancy;
  onMoveOut: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const reconfirm = useReconfirm();
  const [error, setError] = useState<string>();
  const [loginNeeded, setLoginNeeded] = useState(false);
  const inFlight = useRef(false);
  const needed = reconfirmState(occupancy) === "needed";

  async function stay() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(undefined);
    setLoginNeeded(false);
    try {
      await reconfirm.mutateAsync(occupancy.id);
      toast("거주를 확인했어요");
      onOpenChange(false);
    } catch (caught) {
      const { code } = toAppError(caught);
      if (code === "CONFLICT" || code === "NOT_FOUND") {
        // 다른 기기에서 이미 이사 처리했거나 연결이 바뀌었습니다. 새로 받아 화면을 맞춥니다.
        setError("이미 끝난 연결이에요. 화면을 새로 불러올게요");
        void queryClient.invalidateQueries({ queryKey: authKeys.me() });
      } else if (code === "UNAUTHENTICATED") {
        setLoginNeeded(true);
        setError("로그인이 끝났어요. 다시 로그인한 뒤 눌러 주세요");
      } else if (code === "NETWORK" || code === "INTERNAL_ERROR") {
        setError("확인하지 못했어요. 다시 눌러 주세요");
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      inFlight.current = false;
    }
  }

  const pending = reconfirm.isPending;
  return (
    <BottomSheet.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(undefined);
          setLoginNeeded(false);
        }
        onOpenChange(next);
      }}
      dismissible={!pending}
    >
      <Portal>
        <BottomSheet.Positioner>
          <BottomSheet.Backdrop />
          <BottomSheet.Content className="oc-sheet" aria-describedby={undefined}>
            <BottomSheet.Handle />
            <BottomSheet.Body>
              <div className="oc-body">
                <div className="wh-sheet__hami oc-hami">
                  <Hami pose="house" size={140} eager />
                </div>
                <BottomSheet.Title className="wh-sheet__title">
                  아직 {occupancy.buildingName}에 살고 있나요?
                </BottomSheet.Title>
                <p className="wh-sheet__lead">1년에 한 번 연결 상태를 확인해요.</p>
                <p className="oc-if">
                  {needed
                    ? "답이 없어 지금은 새 글쓰기와 공지 알림이 멈춰 있어요. 안내는 계속 읽을 수 있고, ‘아직 살아요’를 누르면 바로 되돌아가요."
                    : `${formatDay(occupancy.reconfirmDueAt)}까지 답하지 않으면 새 글쓰기와 공지 알림이 잠시 멈춰요. 안내는 계속 읽을 수 있고, 언제든 ‘아직 살아요’로 되돌릴 수 있어요.`}
                </p>
                {error ? (
                  <p className="wh-dock__error oc-error" role="alert">
                    {error}
                  </p>
                ) : null}
                {loginNeeded ? <LoginAgainButton className="oc-login" /> : null}
                <div className="wh-btn-row oc-actions">
                  <ActionButton
                    className="wh-btn wh-btn--neutral"
                    size="large"
                    variant="neutralWeak"
                    disabled={pending}
                    onClick={onMoveOut}
                  >
                    이사했어요
                  </ActionButton>
                  <ActionButton
                    className="wh-btn wh-grow"
                    size="large"
                    loading={pending}
                    disabled={pending}
                    onClick={() => void stay()}
                  >
                    아직 살아요
                  </ActionButton>
                </div>
              </div>
            </BottomSheet.Body>
          </BottomSheet.Content>
        </BottomSheet.Positioner>
      </Portal>
    </BottomSheet.Root>
  );
}
