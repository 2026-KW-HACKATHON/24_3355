import { ActionButton } from "@seed-design/react";
import { LOGIN_RESULT_PARAM } from "@wolgyeham/contracts";
import { type ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { KakaoSymbol } from "../../components/Icon";
import { Dock } from "../../components/Screen";
import { type AppError, errorMessage } from "../../lib/errors";
import { useDemoLogin, useDemoLoginAvailable } from "./queries";
import { LOGIN_RESULT_COPY, readLoginResult, startKakaoLogin } from "./session";

/** 카카오 로그인 버튼과 (시연 모드에서만) 시연용 로그인. 로그인 뒤 `returnTo`로 돌아옵니다. */
export function LoginActions({
  returnTo,
  label = "카카오로 시작하기",
  hint,
}: {
  returnTo: string;
  label?: string;
  hint?: ReactNode;
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
  const demoAvailable = useDemoLoginAvailable();
  const demo = useDemoLogin();

  // 카카오에서 뒤로 가기로 돌아오면(bfcache) 버튼을 다시 누를 수 있게 합니다.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setStarting(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function startKakao() {
    setStarting(true);
    setStartError(undefined);
    const error = await startKakaoLogin(returnTo);
    if (error) {
      setStartError(error);
      setStarting(false);
    }
  }

  const message = startError
    ? errorMessage(startError)
    : demo.error
      ? errorMessage(demo.error)
      : loginResult
        ? LOGIN_RESULT_COPY[loginResult]
        : undefined;

  return (
    <Dock hint={hint} error={message}>
      <ActionButton
        className="wh-btn wh-btn--kakao"
        size="large"
        variant="neutralWeak"
        loading={starting}
        disabled={starting || demo.isPending}
        onClick={startKakao}
      >
        <KakaoSymbol />
        {label}
      </ActionButton>
      {demoAvailable.data ? (
        <button
          type="button"
          className="wh-demo-login"
          disabled={demo.isPending || starting}
          onClick={() => demo.mutate()}
        >
          시연용 집주인으로 들어가기
        </button>
      ) : null}
    </Dock>
  );
}
