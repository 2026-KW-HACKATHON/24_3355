import { ActionButton } from "@seed-design/react";
import { type DevLoginBody, LOGIN_RESULT_PARAM, TERMS_VERSION } from "@wolgyeham/contracts";
import { type ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { KakaoSymbol } from "../../components/Icon";
import { Dock } from "../../components/Screen";
import { type AppError, errorMessage } from "../../lib/errors";
import { LoginConsentSheet, loginConsentStep, useTermsAgreed } from "./LoginConsent";
import { useDemoLogin, useDemoLoginAvailable } from "./queries";
import { LOGIN_RESULT_COPY, readLoginResult, startKakaoLogin } from "./session";

const LANDLORD_DEMO = { as: "demo-landlord", label: "시연용 집주인으로 들어가기" } as const;

type LoginKind = "kakao" | "demo";

/**
 * 카카오 로그인 버튼과 (시연 모드에서만) 시연용 로그인. 로그인 뒤 `returnTo`로 돌아옵니다.
 * 초대 수락처럼 카카오 계정이 꼭 필요한 곳은 `allowDemo={false}`로 시연용 로그인을 숨깁니다.
 * `blocked`면 버튼을 막고 그 이유(`blockedReason`)를 버튼 위에 보여줍니다(예: 필수 동의 전).
 * 로그인 전에는 늘 필수 동의를 받습니다(D-28). 화면 안에서 이미 받았으면(16) 그 판을 `consent`로 넘기고, 아니면
 * 버튼을 누를 때 동의 시트를 열어 동의한 뒤 지금 판을 함께 보냅니다. 지금 판에 이미 동의한 계정(다시 로그인)은
 * 동의 단계를 건너뛰고 판을 보내지 않습니다(서버에 남은 동의를 그대로 둠).
 */
export function LoginActions({
  returnTo,
  label = "카카오로 시작하기",
  hint,
  allowDemo = true,
  demo = LANDLORD_DEMO,
  blocked = false,
  blockedReason,
  consent,
}: {
  returnTo: string;
  label?: string;
  hint?: ReactNode;
  allowDemo?: boolean;
  demo?: { as: DevLoginBody["as"]; label: string };
  blocked?: boolean;
  blockedReason?: string;
  consent?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  // 카카오에서 돌아온 결과(?login=…)는 한 번 안내하고 주소에서 지웁니다.
  const [loginResult] = useState(() => readLoginResult(location.search));
  useEffect(() => {
    if (!readLoginResult(location.search)) return;
    const params = new URLSearchParams(location.search);
    params.delete(LOGIN_RESULT_PARAM);
    const search = params.toString();
    void navigate(
      { pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash },
      { replace: true },
    );
  }, [location.hash, location.pathname, location.search, navigate]);
  const [startError, setStartError] = useState<AppError>();
  const [starting, setStarting] = useState(false);
  const demoAvailable = useDemoLoginAvailable(allowDemo);
  const demoLogin = useDemoLogin();
  const agreed = useTermsAgreed();
  const [asking, setAsking] = useState<LoginKind | null>(null);

  // 카카오에서 뒤로 가기로 돌아오면(bfcache) 버튼을 다시 누를 수 있게 합니다.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setStarting(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function startKakao(version: string | undefined) {
    setStarting(true);
    setStartError(undefined);
    const error = await startKakaoLogin(returnTo, version);
    if (error) {
      setStartError(error);
      setStarting(false);
    }
  }

  function run(kind: LoginKind, version: string | undefined) {
    if (kind === "kakao") void startKakao(version);
    else demoLogin.mutate(version ? { as: demo.as, consent: version } : demo.as);
  }

  function press(kind: LoginKind) {
    const step = loginConsentStep(consent, agreed);
    if (step.ask) setAsking(kind);
    else run(kind, step.consent);
  }

  const message = startError
    ? errorMessage(startError)
    : demoLogin.error
      ? errorMessage(demoLogin.error)
      : loginResult
        ? LOGIN_RESULT_COPY[loginResult]
        : undefined;

  return (
    <Dock hint={blocked && blockedReason ? blockedReason : hint} error={message}>
      <ActionButton
        className="wh-btn wh-btn--kakao"
        size="large"
        variant="neutralWeak"
        loading={starting}
        disabled={blocked || starting || demoLogin.isPending}
        onClick={() => press("kakao")}
      >
        <KakaoSymbol />
        {label}
      </ActionButton>
      {allowDemo && demoAvailable.data ? (
        <button
          type="button"
          className="wh-demo-login"
          disabled={blocked || demoLogin.isPending || starting}
          onClick={() => press("demo")}
        >
          {demo.label}
        </button>
      ) : null}
      <LoginConsentSheet
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open) setAsking(null);
        }}
        onAgree={() => {
          const kind = asking;
          setAsking(null);
          if (kind) run(kind, TERMS_VERSION);
        }}
      />
    </Dock>
  );
}
