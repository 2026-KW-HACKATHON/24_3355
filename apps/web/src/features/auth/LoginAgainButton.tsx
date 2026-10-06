import { ActionButton } from "@seed-design/react";
import { TERMS_VERSION } from "@wolgyeham/contracts";
import { useState } from "react";
import { useLocation } from "react-router";
import { KakaoSymbol } from "../../components/Icon";
import { errorMessage } from "../../lib/errors";
import { LoginConsentPanel, loginConsentStep, useTermsAgreed } from "./LoginConsent";
import { startKakaoLogin } from "./session";

/**
 * 로그인이 끝나(401) 하던 일을 못 할 때 ‘로그인이 필요해요’ 옆에 두는 다시 로그인(frontend.md §5).
 * 로그인한 뒤 `returnTo`(기본: 지금 주소)로 돌아옵니다. 쓰던 내용은 `onBeforeLeave`에서 저장해 두고,
 * 돌아와서 자동으로 보내지 않습니다. 지금 판 약관에 동의한 계정이 아니면 이 자리에서 필수 동의를 먼저 받습니다
 * (시트 안에서도 쓰므로 시트를 겹쳐 열지 않고 같은 자리에 펼침).
 */
export function LoginAgainButton({
  returnTo,
  onBeforeLeave,
  className,
}: {
  returnTo?: string;
  onBeforeLeave?: () => void;
  className?: string;
}) {
  const location = useLocation();
  const agreed = useTermsAgreed();
  const [asking, setAsking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  async function start(version: string | undefined) {
    onBeforeLeave?.();
    setStarting(true);
    setError(undefined);
    const startError = await startKakaoLogin(
      returnTo ?? `${location.pathname}${location.search}`,
      version,
    );
    if (startError) {
      setError(errorMessage(startError));
      setStarting(false);
    }
  }

  return (
    <>
      {error ? (
        <p className="wh-dock__error" role="alert">
          {error}
        </p>
      ) : null}
      {asking ? (
        <LoginConsentPanel
          inline
          agreeLabel="동의하고 다시 로그인하기"
          onAgree={() => {
            setAsking(false);
            void start(TERMS_VERSION);
          }}
          onCancel={() => setAsking(false)}
          onBeforeFullDoc={onBeforeLeave}
        />
      ) : (
        <ActionButton
          type="button"
          className={className ? `wh-btn wh-btn--kakao ${className}` : "wh-btn wh-btn--kakao"}
          size="large"
          variant="neutralWeak"
          loading={starting}
          disabled={starting}
          onClick={() => {
            const step = loginConsentStep(undefined, agreed);
            if (step.ask) setAsking(true);
            else void start(step.consent);
          }}
        >
          <KakaoSymbol />
          다시 로그인하기
        </ActionButton>
      )}
    </>
  );
}
