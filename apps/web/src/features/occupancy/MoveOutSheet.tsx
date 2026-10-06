import { ActionButton, BottomSheet, Portal } from "@seed-design/react";
import { useQueryClient } from "@tanstack/react-query";
import type { MeOccupancy } from "@wolgyeham/contracts";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import { errorMessage, toAppError } from "../../lib/errors";
import { LoginAgainButton } from "../auth/LoginAgainButton";
import { authKeys } from "../auth/queries";
import { MOVED_PATH, type MovedState } from "./moved";
import { useMoveOut } from "./queries";
import "./occupancy-sheets.css";

// LF-09 이사 확인 · lofi 08. 내 정보(45)와 재확인 시트(40)의 ‘이사했어요’에서 엽니다.
// 끝나면 연결 종료(09)로 갑니다. 실패하면 시트를 두고 “연결은 그대로예요”를 알립니다.
export function MoveOutSheet({
  open,
  onOpenChange,
  occupancy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occupancy: MeOccupancy;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const moveOut = useMoveOut();
  const [error, setError] = useState<string>();
  const [loginNeeded, setLoginNeeded] = useState(false);
  const inFlight = useRef(false);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(undefined);
    setLoginNeeded(false);
    try {
      await moveOut.mutateAsync(occupancy.id);
      const moved: MovedState = {
        buildingId: occupancy.buildingId,
        buildingName: occupancy.buildingName,
      };
      void navigate(MOVED_PATH, { state: { moved } });
    } catch (caught) {
      const { code } = toAppError(caught);
      if (code === "CONFLICT" || code === "NOT_FOUND") {
        setError("이미 끝난 연결이에요. 화면을 새로 불러올게요");
        void queryClient.invalidateQueries({ queryKey: authKeys.me() });
      } else if (code === "UNAUTHENTICATED") {
        setLoginNeeded(true);
        setError("로그인이 끝났어요. 다시 로그인한 뒤 눌러 주세요");
      } else if (code === "NETWORK" || code === "INTERNAL_ERROR") {
        setError("처리하지 못했어요. 연결은 그대로예요. 다시 눌러 주세요");
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      inFlight.current = false;
    }
  }

  const pending = moveOut.isPending;
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
              <div className="oc-body oc-body--start">
                <BottomSheet.Title className="oc-title">
                  {occupancy.buildingName}에서 이사했나요?
                </BottomSheet.Title>
                <p className="wh-small oc-lead">이사 처리 후에도 계정은 그대로 남아요.</p>
                <div className="oc-cmp oc-cmp--end">
                  <p className="oc-cmp__head">끝나는 것</p>
                  <p className="oc-cmp__item">
                    <Icon name="circle-minus" strokeWidth={2.4} />이 건물의 생활 팁·수정 메모
                    읽기·쓰기
                  </p>
                  <p className="oc-cmp__item">
                    <Icon name="circle-minus" strokeWidth={2.4} />이 건물의 공지 알림
                  </p>
                </div>
                <div className="oc-cmp oc-cmp--keep">
                  <p className="oc-cmp__head">건물에 그대로 남는 것</p>
                  <p className="oc-cmp__item">
                    <Icon name="circle-check" strokeWidth={2.4} />
                    기본 안내와 남겨진 생활 팁
                  </p>
                </div>
                <div className="oc-cmp oc-cmp--keep">
                  <p className="oc-cmp__head">내가 계속 볼 수 있는 것</p>
                  <p className="oc-cmp__item">
                    <Icon name="circle-check" strokeWidth={2.4} />
                    보낸 내용의 처리 상태 (보관 기간 안에서)
                  </p>
                </div>
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
                    onClick={() => onOpenChange(false)}
                  >
                    계속 거주해요
                  </ActionButton>
                  <ActionButton
                    className="wh-btn"
                    size="large"
                    loading={pending}
                    disabled={pending}
                    onClick={() => void confirm()}
                  >
                    이사했어요
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
