// LF-02 수정 메모 작성(12) → 남긴 뒤(13). 한 시트에서 단계만 바꿉니다.
import { ActionButton, BottomSheet, Portal } from "@seed-design/react";
import { useQueryClient } from "@tanstack/react-query";
import { CORRECTION_MEMO_BODY_MAX, type GuideCorrectionMemo } from "@wolgyeham/contracts";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import { isLeaveOk } from "../../components/leaveOk";
import { releaseSheetHeight, useSheetAutoFocus } from "../../components/useSheetAutoFocus";
import { LoginAgainButton } from "../../features/auth/LoginAgainButton";
import { authKeys } from "../../features/auth/queries";
import { clearMemoDraft, memoWritePath, saveMemoDraft } from "../../features/guides/memoDraft";
import { MEMO_STATUS, prepareMemoBody, useCreateMemo } from "../../features/guides/memos";
import { errorMessage, toAppError } from "../../lib/errors";
import { formatDay } from "../../lib/format";

type Phase = "write" | "discard" | "sent";

export function MemoSheet({
  open,
  onOpenChange,
  buildingId,
  guideId,
  label,
  initialBody,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  guideId: string;
  /** 안내 종류 이름(‘분리수거’). */
  label: string;
  /** 다시 로그인하고 돌아왔을 때 채울 쓰던 내용. 자동으로 보내지 않습니다. */
  initialBody: string;
}) {
  const queryClient = useQueryClient();
  const create = useCreateMemo(guideId);
  const [phase, setPhase] = useState<Phase>("write");
  const [body, setBody] = useState(initialBody);
  const [sent, setSent] = useState<GuideCorrectionMemo>();
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const [loginNeeded, setLoginNeeded] = useState(false);
  const inFlight = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const ids = useId();
  useSheetAutoFocus(open, textareaRef);
  useLayoutEffect(() => {
    if (phase === "sent") releaseSheetHeight(contentRef.current);
  }, [phase]);
  const sending = create.isPending;
  const dirty = phase !== "sent" && body.trim() !== "";

  // 열 때마다 새로 시작합니다(돌아온 내용이 있으면 채움).
  useEffect(() => {
    if (!open) return;
    setPhase("write");
    setBody(initialBody);
    setSent(undefined);
    setError(undefined);
    setFieldError(undefined);
    setLoginNeeded(false);
  }, [open, initialBody]);

  // 쓰던 내용이 있는데 뒤로 가기로 떠나려 하면 시트 안에서 한 번 묻습니다(대화상자를 겹치지 않음).
  // 보내는 중에는 묻지 않습니다(KeepSheet와 같음, 리뷰 L11).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      open &&
      dirty &&
      !sending &&
      currentLocation.pathname !== nextLocation.pathname &&
      !isLeaveOk(nextLocation.state),
  );
  const leaving = blocker.state === "blocked";

  function close() {
    onOpenChange(false);
  }

  function requestClose() {
    if (dirty && !sending) setPhase("discard");
    else if (!sending) close();
  }

  async function submit() {
    if (inFlight.current) return;
    // 서버와 같은 규칙으로 보냅니다(제어문자 빼기, 여러 줄은 줄바꿈만. contracts text.ts).
    const prepared = prepareMemoBody(body);
    if (!prepared.ok) {
      setFieldError(
        prepared.reason === "empty"
          ? "달라진 내용을 적어 주세요"
          : `${CORRECTION_MEMO_BODY_MAX}자 안으로 적어 주세요`,
      );
      textareaRef.current?.focus();
      return;
    }
    const trimmed = prepared.text;
    inFlight.current = true;
    setError(undefined);
    setFieldError(undefined);
    setLoginNeeded(false);
    try {
      const memo = await create.mutateAsync(trimmed);
      clearMemoDraft();
      // 입력칸이 사라지기 전에 포커스를 놓고, 키보드에 맞춰 고정된 시트 높이를 풉니다(13이 잘리지 않게).
      textareaRef.current?.blur();
      setSent(memo);
      setBody("");
      setPhase("sent");
    } catch (caught) {
      const appError = toAppError(caught);
      switch (appError.code) {
        case "NETWORK":
        case "INTERNAL_ERROR":
          setError("보내지 못했어요. 쓴 내용은 그대로 있어요. 다시 눌러 주세요");
          break;
        case "RATE_LIMITED":
          setError("방금 이 안내에 메모를 남겼어요. 1분쯤 뒤에 다시 남겨 주세요");
          break;
        case "VALIDATION_FAILED":
          // 길이는 보내기 전에 확인했으므로 여기서는 길이 탓으로 돌리지 않습니다(리뷰 M3).
          setFieldError(errorMessage(appError));
          break;
        case "UNAUTHENTICATED":
          setLoginNeeded(true);
          setError("로그인이 끝났어요. 다시 로그인하면 쓰던 메모를 그대로 채워 둘게요");
          break;
        case "NOT_CONNECTED":
          setError("이 건물에 연결된 거주자만 메모를 남길 수 있어요");
          void queryClient.invalidateQueries({ queryKey: authKeys.me() });
          break;
        case "RECONFIRM_NEEDED":
          setError("거주 확인이 필요해서 지금은 메모를 남길 수 없어요");
          void queryClient.invalidateQueries({ queryKey: authKeys.me() });
          break;
        case "NOT_FOUND":
          setError("이 안내가 내려가서 메모를 남길 수 없어요");
          break;
        default:
          setError(errorMessage(appError));
      }
    } finally {
      inFlight.current = false;
    }
  }

  const count = `${body.length} / ${CORRECTION_MEMO_BODY_MAX}`;
  const showDiscard = phase === "discard" || leaving;

  return (
    <BottomSheet.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && dirty) {
          setPhase("discard");
          return;
        }
        onOpenChange(next);
      }}
      dismissible={!dirty && !sending}
    >
      <Portal>
        <BottomSheet.Positioner>
          <BottomSheet.Backdrop />
          <BottomSheet.Content ref={contentRef} className="gm-sheet" aria-describedby={undefined}>
            {phase === "sent" ? <BottomSheet.Handle /> : null}
            <BottomSheet.Body>
              {phase === "sent" && sent ? (
                <div className="gm-body gm-body--sent">
                  <div className="wh-sheet__hami gm-hami">
                    <Hami pose="tip-saved" size={150} eager />
                  </div>
                  <BottomSheet.Title className="wh-sheet__title">메모를 남겼어요</BottomSheet.Title>
                  <p className="wh-sheet__lead">집주인이 확인하기 전까지 기본 안내는 그대로예요.</p>
                  <div className="gm-sent">
                    <div className="gm-sent__meta">
                      <span className="wh-caption">
                        방금 남긴 메모 · {formatDay(sent.createdAt)}
                      </span>
                      <span className="wh-badge wh-badge--gray">
                        {MEMO_STATUS[sent.status].label}
                      </span>
                    </div>
                    <p className="gm-sent__text">{sent.body}</p>
                  </div>
                  <ActionButton className="wh-btn gm-submit" size="large" onClick={close}>
                    안내로 돌아가기
                  </ActionButton>
                </div>
              ) : showDiscard ? (
                <div className="gm-body gm-body--discard">
                  <BottomSheet.Title className="gm-title">쓰던 메모를 지울까요?</BottomSheet.Title>
                  <p className="wh-small gm-lead">
                    지우면 적은 내용이 사라져요. 기본 안내는 그대로예요.
                  </p>
                  <div className="wh-btn-row gm-discard-actions">
                    <ActionButton
                      className="wh-btn wh-btn--neutral"
                      size="large"
                      variant="neutralWeak"
                      onClick={() => {
                        if (leaving) blocker.reset?.();
                        setPhase("write");
                      }}
                    >
                      계속 쓰기
                    </ActionButton>
                    <ActionButton
                      className="wh-btn"
                      size="large"
                      variant="criticalSolid"
                      onClick={() => {
                        setBody("");
                        clearMemoDraft();
                        if (leaving) blocker.proceed?.();
                        else close();
                      }}
                    >
                      {leaving ? "지우고 나가기" : "지우기"}
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <form
                  className="gm-body"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  <div className="gm-head">
                    <span className="wh-badge wh-badge--gray">{label} 안내</span>
                    <button
                      type="button"
                      className="wh-icon-btn gm-close"
                      aria-label="닫기"
                      disabled={sending}
                      onClick={requestClose}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                  <BottomSheet.Title className="gm-title">
                    어떤 부분이 달라졌나요?
                  </BottomSheet.Title>
                  <p className="wh-small gm-lead">
                    집주인이 확인하고 기본 안내에 반영할 수 있어요.
                  </p>
                  <div className="gm-field">
                    <label className="wh-visually-hidden" htmlFor={`${ids}-memo`}>
                      달라진 내용
                    </label>
                    <textarea
                      ref={textareaRef}
                      id={`${ids}-memo`}
                      className="wh-textarea gm-textarea"
                      value={body}
                      maxLength={CORRECTION_MEMO_BODY_MAX}
                      placeholder="예: 재활용 수거일이 이번 달부터 월·목으로 바뀌었어요."
                      readOnly={sending}
                      aria-invalid={fieldError ? true : undefined}
                      aria-describedby={`${ids}-count ${fieldError ? `${ids}-error` : ""} ${ids}-about`}
                      onChange={(event) => {
                        setBody(event.target.value);
                        if (fieldError) setFieldError(undefined);
                      }}
                    />
                    <span className="gm-count" id={`${ids}-count`}>
                      {count}
                    </span>
                  </div>
                  {fieldError ? (
                    <p className="wh-field-error" id={`${ids}-error`}>
                      {fieldError}
                    </p>
                  ) : null}
                  <p className="gm-about" id={`${ids}-about`}>
                    <Icon name="users" />
                    <span>
                      이 건물 거주자와 집주인이 볼 수 있어요. 작성자는 보이지 않아요.
                      <br />
                      특정인을 짐작할 수 있는 내용은 쓰지 말아 주세요.
                    </span>
                  </p>
                  {error ? (
                    <p className="wh-dock__error gm-error" role="alert">
                      {error}
                    </p>
                  ) : null}
                  {loginNeeded ? (
                    // 쓰던 메모를 이 탭에 두고 다시 로그인한 뒤 `?memo=write`로 돌아와 채웁니다(보내지 않음).
                    <LoginAgainButton
                      className="gm-submit"
                      returnTo={memoWritePath(buildingId, guideId)}
                      onBeforeLeave={() => saveMemoDraft(guideId, body)}
                    />
                  ) : (
                    <ActionButton
                      type="submit"
                      className="wh-btn gm-submit"
                      size="large"
                      loading={sending}
                      disabled={sending}
                    >
                      메모 남기기
                    </ActionButton>
                  )}
                </form>
              )}
            </BottomSheet.Body>
          </BottomSheet.Content>
        </BottomSheet.Positioner>
      </Portal>
    </BottomSheet.Root>
  );
}
