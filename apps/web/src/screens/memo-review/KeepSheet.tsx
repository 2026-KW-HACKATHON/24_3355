// LF-17 기존 안내 유지 · 사유 입력(lofi에 없는 상태, screens.md ‘메모 기존 유지 사유 입력’).
import { ActionButton, BottomSheet, Portal } from "@seed-design/react";
import { CORRECTION_MEMO_REASON_MAX } from "@wolgyeham/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { Icon } from "../../components/Icon";
import { isLeaveOk } from "../../components/leaveOk";
import { useSheetAutoFocus } from "../../components/useSheetAutoFocus";
import { LoginAgainButton } from "../../features/auth/LoginAgainButton";
import { prepareKeepReason, useKeepMemo } from "../../features/guides/memos";
import { errorMessage, toAppError } from "../../lib/errors";
import { cleanText } from "../../lib/text";

export function KeepSheet({
  open,
  onOpenChange,
  memoId,
  onKept,
  onConflict,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memoId: string;
  onKept: () => void;
  /** 다른 곳에서 먼저 반영·유지했음(409). 시트를 닫고 화면을 새로 그립니다. */
  onConflict: () => void;
}) {
  const keep = useKeepMemo(memoId);
  const [reason, setReason] = useState("");
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const [loginNeeded, setLoginNeeded] = useState(false);
  const inFlight = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ids = useId();
  useSheetAutoFocus(open, textareaRef);
  const sending = keep.isPending;
  const dirty = reason.trim() !== "";

  useEffect(() => {
    if (!open) return;
    setReason("");
    setDiscard(false);
    setError(undefined);
    setFieldError(undefined);
    setLoginNeeded(false);
  }, [open]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      open &&
      dirty &&
      !sending &&
      currentLocation.pathname !== nextLocation.pathname &&
      !isLeaveOk(nextLocation.state),
  );
  const leaving = blocker.state === "blocked";

  async function submit() {
    if (inFlight.current) return;
    // 사유는 한 줄입니다(contracts KeepCorrectionMemoBody: 줄바꿈·제어문자 없이 200자).
    const prepared = prepareKeepReason(reason);
    if (!prepared.ok) {
      setFieldError(
        prepared.reason === "empty"
          ? "유지하는 이유를 적어 주세요"
          : `${CORRECTION_MEMO_REASON_MAX}자 안으로 적어 주세요`,
      );
      textareaRef.current?.focus();
      return;
    }
    const trimmed = prepared.text;
    inFlight.current = true;
    setError(undefined);
    setLoginNeeded(false);
    try {
      await keep.mutateAsync(trimmed);
      onKept();
    } catch (caught) {
      const appError = toAppError(caught);
      const { code } = appError;
      if (code === "CONFLICT") onConflict();
      else if (code === "VALIDATION_FAILED") setFieldError(errorMessage(appError));
      else if (code === "NETWORK" || code === "INTERNAL_ERROR")
        setError("저장하지 못했어요. 쓴 사유는 그대로 있어요. 다시 눌러 주세요");
      else if (code === "UNAUTHENTICATED") {
        setLoginNeeded(true);
        setError("로그인이 끝났어요. 다시 로그인한 뒤 사유를 남겨 주세요");
      } else setError(errorMessage(appError));
    } finally {
      inFlight.current = false;
    }
  }

  const showDiscard = discard || leaving;
  return (
    <BottomSheet.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && dirty) {
          setDiscard(true);
          return;
        }
        onOpenChange(next);
      }}
      dismissible={!dirty && !sending}
    >
      <Portal>
        <BottomSheet.Positioner>
          <BottomSheet.Backdrop />
          <BottomSheet.Content className="mr-sheet" aria-describedby={undefined}>
            <BottomSheet.Body>
              {showDiscard ? (
                <div className="mr-sheet__body mr-sheet__body--discard">
                  <BottomSheet.Title className="mr-sheet__title">
                    쓰던 사유를 지울까요?
                  </BottomSheet.Title>
                  <p className="wh-small mr-sheet__lead">메모는 확인 전 상태로 그대로 남아요.</p>
                  <div className="wh-btn-row mr-sheet__actions">
                    <ActionButton
                      className="wh-btn wh-btn--neutral"
                      size="large"
                      variant="neutralWeak"
                      onClick={() => {
                        if (leaving) blocker.reset?.();
                        setDiscard(false);
                      }}
                    >
                      계속 쓰기
                    </ActionButton>
                    <ActionButton
                      className="wh-btn"
                      size="large"
                      variant="criticalSolid"
                      onClick={() => {
                        setReason("");
                        if (leaving) blocker.proceed?.();
                        else onOpenChange(false);
                      }}
                    >
                      {leaving ? "지우고 나가기" : "지우기"}
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <form
                  className="mr-sheet__body"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  <div className="mr-sheet__head">
                    <BottomSheet.Title className="mr-sheet__title">
                      기존 안내를 유지할까요?
                    </BottomSheet.Title>
                    <button
                      type="button"
                      className="wh-icon-btn mr-sheet__close"
                      aria-label="닫기"
                      disabled={sending}
                      onClick={() => (dirty ? setDiscard(true) : onOpenChange(false))}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                  <p className="wh-small mr-sheet__lead">
                    이유를 남겨 주세요. 이 건물 거주자에게 안내 아래에서 보여요.
                  </p>
                  <div className="mr-sheet__field">
                    <label className="wh-visually-hidden" htmlFor={`${ids}-reason`}>
                      유지하는 이유
                    </label>
                    <textarea
                      ref={textareaRef}
                      id={`${ids}-reason`}
                      className="wh-textarea mr-sheet__textarea"
                      value={reason}
                      maxLength={CORRECTION_MEMO_REASON_MAX}
                      placeholder="예: 수거일은 그대로예요. 구청 안내를 다시 확인했어요."
                      readOnly={sending}
                      aria-invalid={fieldError ? true : undefined}
                      aria-describedby={fieldError ? `${ids}-error` : `${ids}-count`}
                      enterKeyHint="done"
                      onKeyDown={(event) => {
                        // 한 줄 사유라 줄을 바꾸지 않습니다(한글 입력 중 Enter는 글자 확정이라 둡니다).
                        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                        }
                      }}
                      onChange={(event) => {
                        setReason(cleanText(event.target.value, { multiline: false }));
                        if (fieldError) setFieldError(undefined);
                      }}
                    />
                    <span className="mr-sheet__count" id={`${ids}-count`}>
                      {reason.length} / {CORRECTION_MEMO_REASON_MAX}
                    </span>
                  </div>
                  {fieldError ? (
                    <p className="wh-field-error" id={`${ids}-error`}>
                      {fieldError}
                    </p>
                  ) : null}
                  {error ? (
                    <p className="wh-dock__error mr-sheet__error" role="alert">
                      {error}
                    </p>
                  ) : null}
                  {loginNeeded ? <LoginAgainButton className="mr-sheet__login" /> : null}
                  <div className="wh-btn-row mr-sheet__actions">
                    <ActionButton
                      type="button"
                      className="wh-btn wh-btn--neutral"
                      size="large"
                      variant="neutralWeak"
                      disabled={sending}
                      onClick={() => (dirty ? setDiscard(true) : onOpenChange(false))}
                    >
                      취소
                    </ActionButton>
                    <ActionButton
                      type="submit"
                      className="wh-btn wh-grow"
                      size="large"
                      loading={sending}
                      disabled={sending}
                    >
                      기존 안내 유지
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
