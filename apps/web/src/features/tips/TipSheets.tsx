// LF-06 팁 목록(04)·내가 남긴 팁의 시트: 내 팁 고치기·지우기, 남의 팁 신고(운영팀이 가림, LF-19).
import { ActionButton, BottomSheet, Portal } from "@seed-design/react";
import { useQueryClient } from "@tanstack/react-query";
import { CONTENT_REPORT_REASON_MAX } from "@wolgyeham/contracts";
import { useCallback, useId, useRef, useState } from "react";
import { type Blocker, useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import { SheetLeaveGuard } from "../../components/SheetLeaveGuard";
import { useToast } from "../../components/useToast";
import { errorMessage, toAppError } from "../../lib/errors";
import { cleanText } from "../../lib/text";
import { LoginAgainButton } from "../auth/LoginAgainButton";
import { tipWriteError } from "./labels";
import { tipKeys, useDeleteTip, useReportTip } from "./queries";
import "./tips.css";

type TipRef = { id: string; buildingId: string };

/** 내 팁: 고치기·지우기. 지우기는 시트 안에서 한 번 더 묻습니다(대화상자를 겹치지 않음). */
export function OwnTipSheet({
  tip,
  open,
  onOpenChange,
  canEdit = true,
}: {
  tip: TipRef | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 가린 팁은 고쳐도 다시 보이지 않아 지우기만 둡니다. */
  canEdit?: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const remove = useDeleteTip();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [loginNeeded, setLoginNeeded] = useState(false);
  const inFlight = useRef(false);
  const pending = remove.isPending;

  function close() {
    setConfirming(false);
    setError(undefined);
    setLoginNeeded(false);
    onOpenChange(false);
  }

  async function confirmDelete() {
    if (!tip || inFlight.current) return;
    inFlight.current = true;
    setError(undefined);
    try {
      await remove.mutateAsync(tip.id);
      toast("팁을 지웠어요");
      close();
    } catch (caught) {
      const appError = toAppError(caught);
      if (appError.code === "NOT_FOUND") {
        // 다른 기기에서 먼저 지웠으면 이미 없는 팁입니다. 목록을 새로 받고 닫습니다.
        void queryClient.invalidateQueries({ queryKey: tipKeys.all() });
        toast("이미 지워진 팁이에요");
        close();
        return;
      }
      setLoginNeeded(appError.code === "UNAUTHENTICATED");
      setError(tipWriteError(appError, "delete"));
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <BottomSheet.Root
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      dismissible={!pending}
    >
      <Portal>
        <BottomSheet.Positioner>
          <BottomSheet.Backdrop />
          <BottomSheet.Content className="tp-sheet" aria-describedby={undefined}>
            <BottomSheet.Handle />
            <BottomSheet.Body>
              {confirming ? (
                <div className="tp-sheet__body tp-sheet__body--confirm">
                  <BottomSheet.Title className="tp-sheet__title">
                    이 팁을 지울까요?
                  </BottomSheet.Title>
                  <p className="wh-small tp-sheet__lead">
                    지우면 다른 거주자에게도 보이지 않고, 되돌릴 수 없어요.
                  </p>
                  {error ? (
                    <p className="wh-dock__error tp-sheet__error" role="alert">
                      {error}
                    </p>
                  ) : null}
                  {loginNeeded ? <LoginAgainButton className="tp-sheet__login" /> : null}
                  <div className="wh-btn-row tp-sheet__actions">
                    <ActionButton
                      className="wh-btn wh-btn--neutral"
                      size="large"
                      variant="neutralWeak"
                      disabled={pending}
                      onClick={() => {
                        setConfirming(false);
                        setError(undefined);
                        setLoginNeeded(false);
                      }}
                    >
                      그대로 두기
                    </ActionButton>
                    <ActionButton
                      className="wh-btn"
                      size="large"
                      variant="criticalSolid"
                      loading={pending}
                      disabled={pending}
                      onClick={() => void confirmDelete()}
                    >
                      지우기
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <div className="tp-sheet__body">
                  <BottomSheet.Title className="tp-sheet__title">내 팁</BottomSheet.Title>
                  <p className="wh-small tp-sheet__lead">
                    다른 거주자에게 작성자가 안 보여요. ‘내 팁’ 표시는 나에게만 보여요.
                  </p>
                  <div className="tp-menu">
                    {canEdit ? (
                      <button
                        type="button"
                        className="tp-menu__row"
                        onClick={() => {
                          if (!tip) return;
                          close();
                          void navigate(`/b/${tip.buildingId}/tips/${tip.id}/edit`);
                        }}
                      >
                        <Icon name="pencil-line" />
                        고치기
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="tp-menu__row tp-menu__row--danger"
                      onClick={() => setConfirming(true)}
                    >
                      <Icon name="trash-2" />
                      지우기
                    </button>
                  </div>
                </div>
              )}
            </BottomSheet.Body>
          </BottomSheet.Content>
        </BottomSheet.Positioner>
      </Portal>
    </BottomSheet.Root>
  );
}

/** 남의 팁 신고. 사유는 선택이고, 신고만으로 가려지지 않고 운영팀이 확인합니다(D-22). */
export function TipReportSheet({
  tip,
  open,
  onOpenChange,
  onGone,
  byLandlord = false,
}: {
  tip: TipRef | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 그사이 가려졌거나 지워진 팁(404)이면 목록을 새로 받습니다. */
  onGone?: () => void;
  /** 집주인이 신고하면 ‘집주인에게 보이지 않아요’ 대신 거주자에게 안 보인다고만 씁니다(리뷰 L7). */
  byLandlord?: boolean;
}) {
  const toast = useToast();
  const report = useReportTip();
  const ids = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [discarding, setDiscarding] = useState(false);
  const [leaving, setLeaving] = useState<Blocker>();
  const [loginNeeded, setLoginNeeded] = useState(false);
  const inFlight = useRef(false);
  const pending = report.isPending;
  const dirty = reason.trim() !== "";
  const onBlocked = useCallback((blocker: Blocker) => setLeaving(blocker), []);

  function close() {
    setReason("");
    setError(undefined);
    setDiscarding(false);
    setLeaving(undefined);
    setLoginNeeded(false);
    onOpenChange(false);
  }

  function requestClose() {
    if (pending) return;
    if (dirty) setDiscarding(true);
    else close();
  }

  async function submit() {
    if (!tip || inFlight.current) return;
    inFlight.current = true;
    setError(undefined);
    try {
      const result = await report.mutateAsync({ tipId: tip.id, reason: reason.trim() });
      toast(
        result.alreadyReported
          ? "이미 신고한 팁이에요. 운영팀이 확인하고 있어요"
          : "신고를 받았어요. 운영팀이 확인할게요",
      );
      close();
    } catch (caught) {
      const appError = toAppError(caught);
      if (appError.code === "NOT_FOUND") {
        setError("이미 가려졌거나 지워진 팁이에요");
        onGone?.();
      } else if (appError.code === "NETWORK" || appError.code === "INTERNAL_ERROR") {
        setError("신고하지 못했어요. 적은 사유는 그대로 있어요. 다시 눌러 주세요");
      } else if (appError.code === "VALIDATION_FAILED") {
        setError(
          reason.trim().length > CONTENT_REPORT_REASON_MAX
            ? `사유는 ${CONTENT_REPORT_REASON_MAX}자까지 적을 수 있어요`
            : errorMessage(appError),
        );
      } else if (appError.code === "UNAUTHENTICATED") {
        setLoginNeeded(true);
        setError("로그인이 끝났어요. 다시 로그인한 뒤 신고해 주세요");
      } else {
        setError(errorMessage(appError));
      }
    } finally {
      inFlight.current = false;
    }
  }

  const showDiscard = discarding || leaving !== undefined;

  return (
    <BottomSheet.Root
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
      dismissible={!pending && !dirty}
    >
      <Portal>
        <BottomSheet.Positioner>
          <BottomSheet.Backdrop />
          <BottomSheet.Content className="tp-sheet" aria-describedby={undefined}>
            {open && dirty ? <SheetLeaveGuard onBlocked={onBlocked} /> : null}
            <BottomSheet.Body>
              {showDiscard ? (
                <div className="tp-sheet__body tp-sheet__body--confirm">
                  <BottomSheet.Title className="tp-sheet__title">
                    적은 사유를 지울까요?
                  </BottomSheet.Title>
                  <p className="wh-small tp-sheet__lead">아직 신고하지 않았어요.</p>
                  <div className="wh-btn-row tp-sheet__actions">
                    <ActionButton
                      className="wh-btn wh-btn--neutral"
                      size="large"
                      variant="neutralWeak"
                      onClick={() => {
                        leaving?.reset?.();
                        setLeaving(undefined);
                        setDiscarding(false);
                      }}
                    >
                      계속 쓰기
                    </ActionButton>
                    <ActionButton
                      className="wh-btn"
                      size="large"
                      variant="criticalSolid"
                      onClick={() => {
                        if (leaving) leaving.proceed?.();
                        else close();
                      }}
                    >
                      {leaving ? "지우고 나가기" : "지우기"}
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <form
                  className="tp-sheet__body"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  <div className="tp-sheet__head">
                    <span className="tp-sheet__mark">
                      <Icon name="flag" />
                    </span>
                    <button
                      type="button"
                      className="wh-icon-btn tp-sheet__close"
                      aria-label="닫기"
                      disabled={pending}
                      onClick={requestClose}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                  <BottomSheet.Title className="tp-sheet__title">
                    이 팁을 신고할까요?
                  </BottomSheet.Title>
                  <p className="wh-small tp-sheet__lead">
                    {byLandlord
                      ? "운영팀이 확인하고 필요하면 가려요. 신고한 사람은 거주자에게 보이지 않아요."
                      : "운영팀이 확인하고 필요하면 가려요. 신고한 사람은 다른 거주자와 집주인에게 보이지 않아요."}
                  </p>
                  <div className="tp-sheet__field">
                    <label className="wh-field-label" htmlFor={`${ids}-reason`}>
                      <span>
                        사유 <span className="tp-opt">선택</span>
                      </span>
                      <span className="wh-field-label__count" aria-hidden="true">
                        {reason.length}/{CONTENT_REPORT_REASON_MAX}
                      </span>
                    </label>
                    <input
                      id={`${ids}-reason`}
                      className="wh-input tp-sheet__input"
                      value={reason}
                      maxLength={CONTENT_REPORT_REASON_MAX}
                      placeholder="예: 특정인을 짐작할 수 있는 내용이 있어요"
                      autoComplete="off"
                      enterKeyHint="send"
                      readOnly={pending}
                      onChange={(event) =>
                        setReason(cleanText(event.target.value, { multiline: false }))
                      }
                    />
                  </div>
                  {error ? (
                    <p className="wh-dock__error tp-sheet__error" role="alert">
                      {error}
                    </p>
                  ) : null}
                  {loginNeeded ? <LoginAgainButton className="tp-sheet__login" /> : null}
                  <div className="wh-btn-row tp-sheet__actions">
                    <ActionButton
                      type="button"
                      className="wh-btn wh-btn--neutral"
                      size="large"
                      variant="neutralWeak"
                      disabled={pending}
                      onClick={requestClose}
                    >
                      취소
                    </ActionButton>
                    <ActionButton
                      type="submit"
                      className="wh-btn wh-grow"
                      size="large"
                      loading={pending}
                      disabled={pending}
                    >
                      신고하기
                    </ActionButton>
                  </div>
                </form>
              )}
            </BottomSheet.Body>
          </BottomSheet.Content>
        </BottomSheet.Positioner>
      </Portal>
    </BottomSheet.Root>
  );
}
