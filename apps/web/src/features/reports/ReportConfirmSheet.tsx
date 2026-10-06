// LF-10 보내기 전 확인 · lofi 20. 자주 쓰는 말(01)을 누르면 열리고(첫 번째 탭), ‘집주인에게 보내기’(두 번째 탭)로
// 보냅니다. 직접 적기(05)의 ‘보낼 내용 확인’도 같은 시트를 씁니다. 성공하면 접수(06)로 가고, 실패하면 시트와
// 입력을 그대로 두고 이유를 시트 안에 보여줍니다(interaction.md §5).
import { ActionButton, BottomSheet, Portal } from "@seed-design/react";
import {
  type CreateReportBody,
  REPORT_BODY_MAX,
  type ReportKind,
  type ReportLocation,
  type ReportPreset,
} from "@wolgyeham/contracts";
import { type RefObject, useCallback, useEffect, useId, useRef, useState } from "react";
import { type Blocker, Link, useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import { LEAVE_OK } from "../../components/leaveOk";
import { SheetLeaveGuard } from "../../components/SheetLeaveGuard";
import { type AppErrorCode, toAppError } from "../../lib/errors";
import { reportPath, saveReportAccess } from "../../lib/reportAccess";
import { cleanText } from "../../lib/text";
import {
  REPORT_KIND_LABEL,
  REPORT_LOCATION_LABEL,
  REPORT_PRESET_COPY,
  reportSendError,
} from "./labels";
import { useCreateReport } from "./queries";
import { REPORT_SENT_STATE } from "./sentState";
import "./reports.css";

export type ReportDraft =
  | { source: "preset"; preset: ReportPreset }
  | { source: "custom"; kind: ReportKind; location: ReportLocation | null; body: string };

function toBody(draft: ReportDraft, detail: string): CreateReportBody {
  if (draft.source === "preset") {
    const extra = cleanText(detail, { multiline: true }).trim();
    return extra
      ? { source: "preset", preset: draft.preset, detail: extra }
      : { source: "preset", preset: draft.preset };
  }
  return {
    source: "custom",
    kind: draft.kind,
    body: cleanText(draft.body, { multiline: true }).trim(),
    ...(draft.location ? { location: draft.location } : {}),
  };
}

/**
 * 시트가 닫힌 뒤 포커스가 갈 곳이 없으면(SEED가 돌려주려는 요소가 이미 사라져 body로 떨어짐) `target`으로
 * 옮깁니다. 닫히는 동안(d4)에는 시트 안에 포커스가 남아 있어 몇 프레임 기다립니다(최대 약 1초).
 */
function focusWhenSettled(target: HTMLElement | null) {
  let frames = 0;
  const tick = () => {
    if (!target?.isConnected || document.activeElement === target) return;
    if (document.activeElement === null || document.activeElement === document.body) {
      target.focus();
      return;
    }
    frames += 1;
    if (frames < 60) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function ReportConfirmSheet({
  open,
  onOpenChange,
  buildingId,
  buildingName,
  draft,
  replace = false,
  closeOnBack = false,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  buildingName: string;
  /** 닫히는 동안에도 내용이 보이도록 닫은 뒤에도 마지막 값을 넘겨 주세요. */
  draft: ReportDraft | null;
  /** 직접 적기(05)에서 열면 true: 접수 화면으로 바꾸고, 뒤로 가면 쓰던 화면이 아니라 건물로 갑니다. */
  replace?: boolean;
  /**
   * 열린 채 뒤로 가면 화면을 떠나지 않고 시트만 닫습니다. 쓰던 화면(05)의 나가기 확인 대화상자가 시트 위에
   * 겹치지 않게 합니다(interaction.md §4, 리뷰 M5). 보내는 중이면 그대로 둡니다.
   */
  closeOnBack?: boolean;
  /** 닫힌 뒤 포커스를 돌려줄 곳. 다른 시트(알리기 입구)에서 열려 누른 버튼이 사라졌을 때 씁니다(리뷰 L1). */
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const navigate = useNavigate();
  const create = useCreateReport(buildingId);
  const ids = useId();
  const [detail, setDetail] = useState("");
  const [adding, setAdding] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [leaving, setLeaving] = useState<Blocker>();
  const [error, setError] = useState<{ code: AppErrorCode; message: string }>();
  const inFlight = useRef(false);
  // 앞서 보낸 요청의 결과를 모르면(시간 초과·연결 끊김) 다음 반복 제한(429)을 ‘이미 접수됐을 수 있음’으로 읽습니다.
  const unknownResult = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sending = create.isPending;
  const dirty = draft?.source === "preset" && detail.trim() !== "";
  const onBlocked = useCallback(
    (blocker: Blocker) => {
      if (dirty) {
        setLeaving(blocker);
        return;
      }
      // 덧붙인 내용이 없으면 묻지 않고 시트만 닫습니다(화면은 떠나지 않음).
      blocker.reset?.();
      if (sending) return;
      setError(undefined);
      unknownResult.current = false;
      onOpenChange(false);
    },
    [dirty, sending, onOpenChange],
  );

  function reset() {
    setDetail("");
    setAdding(false);
    setDiscarding(false);
    setLeaving(undefined);
    setError(undefined);
    unknownResult.current = false;
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function requestClose() {
    if (sending) return;
    if (dirty) setDiscarding(true);
    else close();
  }

  async function send() {
    if (!draft || inFlight.current) return;
    inFlight.current = true;
    setError(undefined);
    try {
      const result = await create.mutateAsync(toBody(draft, detail));
      const token = result.accessToken;
      const stored = token
        ? saveReportAccess({
            reportId: result.report.id,
            buildingId: result.report.buildingId,
            token,
            expiresAt: result.accessExpiresAt,
          })
        : true;
      void navigate(reportPath(result.report.id, token), {
        replace,
        state: { ...LEAVE_OK, [REPORT_SENT_STATE]: { stored } },
      });
    } catch (caught) {
      const appError = toAppError(caught);
      setError({
        code: appError.code,
        message: reportSendError(appError, { afterUnknown: unknownResult.current }),
      });
      unknownResult.current = appError.code === "NETWORK" || appError.code === "INTERNAL_ERROR";
    } finally {
      inFlight.current = false;
    }
  }

  const showDiscard = discarding || leaving !== undefined;

  // 닫히면(부모가 open을 false로) 입구 시트를 연 버튼으로 포커스를 돌려줍니다. SEED의 onAnimationEnd는
  // 시트가 스스로 닫힐 때만 불려서 open 변화로 봅니다.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && returnFocus) focusWhenSettled(returnFocus.current);
    wasOpen.current = open;
  }, [open, returnFocus]);

  return (
    <BottomSheet.Root
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else requestClose();
      }}
      dismissible={!sending && !dirty}
    >
      <Portal>
        <BottomSheet.Positioner>
          <BottomSheet.Backdrop />
          <BottomSheet.Content className="rp-sheet" aria-describedby={undefined}>
            {adding ? null : <BottomSheet.Handle />}
            {open && (dirty || closeOnBack) ? <SheetLeaveGuard onBlocked={onBlocked} /> : null}
            <BottomSheet.Body>
              {showDiscard ? (
                <div className="rp-sheet__body rp-sheet__body--discard">
                  <BottomSheet.Title className="rp-sheet__title">
                    덧붙인 내용을 지울까요?
                  </BottomSheet.Title>
                  <p className="wh-small rp-sheet__lead">
                    아직 보내지 않았어요. 지우면 적은 내용이 사라져요.
                  </p>
                  <div className="wh-btn-row rp-sheet__actions">
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
                        if (leaving) {
                          leaving.proceed?.();
                          return;
                        }
                        close();
                      }}
                    >
                      {leaving ? "지우고 나가기" : "지우기"}
                    </ActionButton>
                  </div>
                </div>
              ) : draft ? (
                <div className="rp-sheet__body">
                  {adding ? (
                    <div className="rp-sheet__close">
                      <button
                        type="button"
                        className="wh-icon-btn"
                        aria-label="닫기"
                        disabled={sending}
                        onClick={requestClose}
                      >
                        <Icon name="x" />
                      </button>
                    </div>
                  ) : null}
                  <BottomSheet.Title className="rp-sheet__title">
                    이대로 보낼까요?
                  </BottomSheet.Title>
                  <dl className="rp-rows">
                    <div className="rp-rows__row">
                      <dt>받는 사람</dt>
                      <dd>{buildingName} 집주인</dd>
                    </div>
                    <div className="rp-rows__row">
                      <dt>공개 범위</dt>
                      <dd>집주인만 봐요 · 게시되지 않아요</dd>
                    </div>
                    {draft.source === "custom" ? (
                      <>
                        <div className="rp-rows__row">
                          <dt>종류</dt>
                          <dd>{REPORT_KIND_LABEL[draft.kind]}</dd>
                        </div>
                        {draft.location ? (
                          <div className="rp-rows__row">
                            <dt>위치</dt>
                            <dd>{REPORT_LOCATION_LABEL[draft.location]}</dd>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </dl>
                  {draft.source === "preset" ? (
                    <p className="rp-quote rp-quote--strong">
                      {REPORT_PRESET_COPY[draft.preset].text}
                    </p>
                  ) : (
                    <p className="rp-quote">{draft.body.trim()}</p>
                  )}

                  {draft.source === "preset" ? (
                    adding ? (
                      <div className="rp-detail">
                        <label className="wh-field-label" htmlFor={`${ids}-detail`}>
                          위치나 내용 덧붙이기
                          <span className="wh-field-label__count" id={`${ids}-count`}>
                            {detail.length} / {REPORT_BODY_MAX}
                          </span>
                        </label>
                        <textarea
                          ref={textareaRef}
                          id={`${ids}-detail`}
                          className="wh-textarea rp-detail__input"
                          value={detail}
                          maxLength={REPORT_BODY_MAX}
                          placeholder="예: 분리수거함 옆, 오늘 아침부터 그래요"
                          readOnly={sending}
                          aria-describedby={`${ids}-count`}
                          onChange={(event) => setDetail(event.target.value)}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="rp-add"
                        onClick={() => {
                          setAdding(true);
                          requestAnimationFrame(() => textareaRef.current?.focus());
                        }}
                      >
                        <Icon name="plus" />
                        위치나 내용 덧붙이기
                        <span className="rp-add__opt">선택</span>
                      </button>
                    )
                  ) : null}

                  {error ? (
                    <div className="rp-sheet__error" role="alert">
                      <p className="wh-dock__error">{error.message}</p>
                      {error.code === "FORBIDDEN" ? (
                        <Link className="rp-sheet__error-link" to={`/manage/${buildingId}/inbox`}>
                          받은 내용 보기
                          <Icon name="chevron-right" />
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="wh-btn-row rp-sheet__actions">
                    <ActionButton
                      className="wh-btn wh-btn--neutral"
                      size="large"
                      variant="neutralWeak"
                      disabled={sending}
                      onClick={requestClose}
                    >
                      취소
                    </ActionButton>
                    <ActionButton
                      className="wh-btn wh-grow"
                      size="large"
                      loading={sending}
                      disabled={sending}
                      onClick={() => void send()}
                    >
                      <Icon name="send" />
                      집주인에게 보내기
                    </ActionButton>
                  </div>
                </div>
              ) : null}
            </BottomSheet.Body>
          </BottomSheet.Content>
        </BottomSheet.Positioner>
      </Portal>
    </BottomSheet.Root>
  );
}
