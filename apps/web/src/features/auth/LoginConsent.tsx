import { ActionButton, BottomSheet, Portal } from "@seed-design/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { allAgreed, ConsentChecks, type ConsentValue, NO_CONSENT } from "./ConsentChecks";
import { CONSENT_DOC_PATH, type ConsentDoc, ConsentDocSummary } from "./ConsentSheet";
import { useMe } from "./queries";
import "./consent.css";

// 모든 로그인 입구에서 로그인 전에 필수 동의를 받습니다(D-28, 오케스트레이터 결정). 16은 화면 안의 동의 항목을
// 쓰고, 그 밖의 입구는 이 동의 단계를 거친 뒤 카카오·시연 로그인에 지금 판(`TERMS_VERSION`)을 함께 보냅니다.

/**
 * 지금 판에 이미 동의한 계정인지(`/me`의 `termsUpToDate`). 로그인이 끝나 다시 로그인하는 사람처럼 내 정보가
 * 남아 있고 이미 동의했으면 동의 단계를 건너뜁니다. 모르면(로그인 전·확인 전) 동의를 받습니다.
 */
export function useTermsAgreed(): boolean {
  const me = useMe();
  return me.data?.user.termsUpToDate === true;
}

/**
 * 로그인 버튼을 눌렀을 때 할 일. 화면 안에서 동의를 받았으면(16) 그 판으로 바로, 지금 판에 이미 동의한 계정이면
 * 판 없이 바로(서버의 동의 기록을 그대로 둠), 그 밖에는 동의 단계를 먼저 엽니다.
 */
export function loginConsentStep(
  screenConsent: string | undefined,
  agreed: boolean,
): { ask: true } | { ask: false; consent: string | undefined } {
  if (screenConsent) return { ask: false, consent: screenConsent };
  if (agreed) return { ask: false, consent: undefined };
  return { ask: true };
}

const TITLE = "로그인 전에 확인해 주세요";

/**
 * 동의 항목(ConsentChecks)과 ‘보기’ 요약을 한 자리에서 바꿔 보여줍니다. 시트 안에서 다른 시트를 겹쳐 열 수
 * 없어서(SEED 시트는 겹치지 않음) 요약도 같은 자리에 그립니다. `onBeforeFullDoc`는 ‘전문 보기’로 이 화면을
 * 떠나기 전에 부릅니다(쓰던 내용 저장).
 */
export function LoginConsentPanel({
  agreeLabel,
  onAgree,
  onCancel,
  onBeforeFullDoc,
  renderTitle = (text) => <h3 className="au-login__title">{text}</h3>,
  inline = false,
}: {
  agreeLabel: string;
  onAgree: () => void;
  onCancel: () => void;
  onBeforeFullDoc?: (() => void) | undefined;
  renderTitle?: (text: string) => ReactNode;
  inline?: boolean;
}) {
  const [value, setValue] = useState<ConsentValue>(NO_CONSENT);
  const [viewing, setViewing] = useState<ConsentDoc | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const returnTo = useRef<ConsentDoc | null>(null);
  const agreed = allAgreed(value);

  // 요약을 열고 닫을 때 포커스를 옮깁니다: 열면 요약의 첫 버튼, 닫으면 누른 ‘보기’로.
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    if (viewing) {
      container
        .querySelector<HTMLElement>(".wh-sheet__actions a, .wh-sheet__actions button")
        ?.focus();
    } else if (returnTo.current) {
      container
        .querySelectorAll<HTMLElement>(".au-check__view")
        [returnTo.current === "terms" ? 0 : 1]?.focus();
      returnTo.current = null;
    }
  }, [viewing]);

  return (
    <div ref={root} className={inline ? "au-login au-login--inline" : "au-login"}>
      {viewing ? (
        <ConsentDocSummary
          doc={viewing}
          renderTitle={renderTitle}
          actions={
            <>
              <ActionButton
                asChild
                className="wh-btn wh-btn--secondary"
                size="large"
                variant="neutralWeak"
              >
                <Link to={CONSENT_DOC_PATH[viewing]} onClick={onBeforeFullDoc}>
                  전문 보기
                </Link>
              </ActionButton>
              <ActionButton
                className="wh-btn"
                size="large"
                onClick={() => {
                  returnTo.current = viewing;
                  setViewing(null);
                }}
              >
                동의 항목으로 돌아가기
              </ActionButton>
            </>
          }
        />
      ) : (
        <>
          {renderTitle(TITLE)}
          <p className="au-login__note">
            카카오 로그인은 거주를 확인하는 절차가 아니에요. 로그인하지 않아도 건물 안내는 볼 수
            있어요.
          </p>
          <ConsentChecks value={value} onChange={setValue} onView={setViewing} />
          <p className="au-login__note">약관과 개인정보 처리방침은 법률 검토 전 초안이에요.</p>
          <div className="wh-sheet__actions">
            <ActionButton className="wh-btn" size="large" disabled={!agreed} onClick={onAgree}>
              {agreeLabel}
            </ActionButton>
            <ActionButton
              className="wh-btn wh-btn--neutral"
              size="large"
              variant="neutralWeak"
              onClick={onCancel}
            >
              {inline ? "취소" : "닫기"}
            </ActionButton>
          </div>
          {agreed ? null : <p className="au-login__hint">필수 항목에 동의하면 계속할 수 있어요</p>}
        </>
      )}
    </div>
  );
}

/** 로그인 버튼(LoginActions·‘이미 연결했어요 · 로그인’)을 누르면 여는 동의 시트. 동의하면 `onAgree`로 로그인을 이어 갑니다. */
export function LoginConsentSheet({
  open,
  onOpenChange,
  onAgree,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAgree: () => void;
}) {
  return (
    <BottomSheet.Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <BottomSheet.Positioner>
          <BottomSheet.Backdrop />
          <BottomSheet.Content className="au-doc" aria-describedby={undefined}>
            <BottomSheet.Handle />
            <BottomSheet.Body>
              <div className="au-doc__body">
                <LoginConsentPanel
                  agreeLabel="동의하고 계속하기"
                  onAgree={onAgree}
                  onCancel={() => onOpenChange(false)}
                  renderTitle={(text) => (
                    <BottomSheet.Title className="wh-sheet__title">{text}</BottomSheet.Title>
                  )}
                />
              </div>
            </BottomSheet.Body>
          </BottomSheet.Content>
        </BottomSheet.Positioner>
      </Portal>
    </BottomSheet.Root>
  );
}
