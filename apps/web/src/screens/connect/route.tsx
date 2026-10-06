// LF-04 우리 건물로 연결 · lofi 02 16 (기존 관계 변경 확인, 연결 뒤 알림 선택 17은 앱 틀이 띄움)
import { ActionButton, Skeleton } from "@seed-design/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ConnectResult,
  JOIN_CODE_LOCK_MINUTES,
  type Me,
  type MeOccupancy,
  type PublicBuilding,
  TERMS_VERSION,
} from "@wolgyeham/contracts";
import { type FormEvent, type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { CodeCells } from "../../components/CodeCells";
import { Icon } from "../../components/Icon";
import { Dock, Screen, TopBar, useGoBack } from "../../components/Screen";
import { Delayed, EmptyState, LoadError } from "../../components/ScreenState";
import { useToast } from "../../components/useToast";
import { allAgreed, ConsentChecks, NO_CONSENT } from "../../features/auth/ConsentChecks";
import { type ConsentDoc, ConsentSheet } from "../../features/auth/ConsentSheet";
import { LoginActions } from "../../features/auth/LoginActions";
import { LoginConsentSheet } from "../../features/auth/LoginConsent";
import { authKeys, useMe } from "../../features/auth/queries";
import { startKakaoLogin } from "../../features/auth/session";
import { BuildingNotFound } from "../../features/buildings/BuildingNotFound";
import { usePublicBuilding } from "../../features/buildings/queries";
import {
  type ConnectDraft,
  clearConnectDraft,
  loadConnectDraft,
  resolveConnectReturnTo,
  saveConnectDraft,
} from "../../features/occupancy/connectDraft";
import type { ConnectedState } from "../../features/occupancy/connectedState";
import {
  isCompleteJoinCode,
  lockMinutesLeft,
  mergePastedJoinCode,
  sanitizeJoinCode,
} from "../../features/occupancy/joinCode";
import { useCheckJoinCode, useConnect } from "../../features/occupancy/queries";
import { reconfirmState } from "../../features/occupancy/reconfirm";
import { forgetSubscription } from "../../features/push/push";
import { type AppError, errorMessage, toAppError } from "../../lib/errors";
import { withRo } from "../../lib/format";
import { connectedToast, connectFailureCopy } from "./outcome";
import "./connect.css";

type CodeError =
  | { kind: "invalid" | "changed" | "other"; message: string }
  | { kind: "locked"; until: number };

export function Component() {
  const { buildingId = "" } = useParams();
  const [params] = useSearchParams();
  const returnTo = resolveConnectReturnTo(params.get("returnTo"), buildingId);
  const building = usePublicBuilding(buildingId);
  const me = useMe();

  if (building.isError) {
    const { code } = toAppError(building.error);
    if (code === "NOT_FOUND" || code === "VALIDATION_FAILED") {
      return (
        <BuildingNotFound onRetry={() => void building.refetch()} retrying={building.isFetching} />
      );
    }
    return (
      <ConnectShell returnTo={returnTo}>
        <LoadError onRetry={() => void building.refetch()} retrying={building.isFetching} />
      </ConnectShell>
    );
  }
  // 로그인 여부를 모르면 로그인 전으로 치지 않고 다시 확인하게 합니다(401만 로그인 전).
  if (me.isError) {
    return (
      <ConnectShell returnTo={returnTo}>
        <LoadError onRetry={() => void me.refetch()} retrying={me.isFetching} />
      </ConnectShell>
    );
  }
  if (building.isPending || me.isPending) {
    return (
      <ConnectShell returnTo={returnTo} busy>
        <Delayed label="연결 화면을 여는 중">
          <div className="wh-pad cn-skeleton">
            <Skeleton radius="8" height="4px" />
            <Skeleton radius="16" height="36px" width="55%" />
            <Skeleton radius="8" height="30px" width="80%" />
            <Skeleton radius="16" height="60px" />
          </div>
        </Delayed>
      </ConnectShell>
    );
  }
  // 재확인 요청 중이거나 재확인이 필요한 거주자는 가입코드를 다시 넣어 재확인할 수 있게 둡니다(D-17).
  const own = me.data?.occupancy?.buildingId === buildingId ? me.data.occupancy : null;
  if (own && reconfirmState(own) === "none") {
    return <AlreadyConnected building={building.data} returnTo={returnTo} />;
  }
  return <ConnectFlow building={building.data} me={me.data} returnTo={returnTo} />;
}

function ConnectShell({
  returnTo,
  onBack,
  busy = false,
  dock,
  children,
}: {
  returnTo: string;
  onBack?: (() => void) | undefined;
  busy?: boolean;
  dock?: ReactNode;
  children: ReactNode;
}) {
  const goBack = useGoBack(returnTo);
  return (
    <Screen
      busy={busy}
      dock={dock}
      topbar={
        <TopBar
          start={
            <button
              type="button"
              className="wh-icon-btn"
              aria-label="뒤로"
              onClick={onBack ?? goBack}
            >
              <Icon name="chevron-left" />
            </button>
          }
          title="우리 건물로 연결하기"
        />
      }
    >
      {children}
    </Screen>
  );
}

function StepHead({ step, label }: { step: 1 | 2; label: string }) {
  return (
    <div className="cn-steps">
      <div className="cn-steps__bar" aria-hidden="true">
        <span className="cn-steps__seg cn-steps__seg--on" />
        <span className={step === 2 ? "cn-steps__seg cn-steps__seg--on" : "cn-steps__seg"} />
      </div>
      <p className="wh-caption cn-steps__label">
        {step} / 2 · {label}
      </p>
    </div>
  );
}

function AlreadyConnected({ building, returnTo }: { building: PublicBuilding; returnTo: string }) {
  // 로그인하고 보니 이미 연결돼 있으면 확인해 둔 가입코드는 더 쓰지 않습니다.
  useEffect(() => {
    if (loadConnectDraft(building.id)) clearConnectDraft();
  }, [building.id]);
  return (
    <ConnectShell
      returnTo={returnTo}
      dock={
        <Dock>
          <ActionButton asChild className="wh-btn" size="large">
            <Link to={returnTo} replace>
              우리 건물로 가기
            </Link>
          </ActionButton>
        </Dock>
      }
    >
      <div className="wh-pad wh-state-top">
        <EmptyState
          icon="circle-check"
          title={`이미 ${building.name}에 연결돼 있어요`}
          description="공지와 안내는 우리 건물 화면에서 이어서 볼 수 있어요."
        />
      </div>
    </ConnectShell>
  );
}

function ConnectFlow({
  building,
  me,
  returnTo,
}: {
  building: PublicBuilding;
  me: Me | null;
  returnTo: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<ConnectDraft | undefined>(() => loadConnectDraft(building.id));
  const [step, setStep] = useState<"code" | "account">(draft ? "account" : "code");
  const [code, setCode] = useState(draft?.code ?? "");
  const [codeError, setCodeError] = useState<CodeError>();
  const [connectError, setConnectError] = useState<string>();
  const check = useCheckJoinCode(building.id);
  const connect = useConnect(building.id);
  const other = me?.occupancy && me.occupancy.buildingId !== building.id ? me.occupancy : null;
  const reconfirming = me?.occupancy?.buildingId === building.id;
  const clearLock = useCallback(() => setCodeError(undefined), []);

  function keepDraft(checkedCode: string, buildingName: string) {
    const next = { buildingId: building.id, buildingName, code: checkedCode, returnTo };
    saveConnectDraft(next);
    setDraft({ ...next, savedAt: Date.now() });
  }

  function showCodeError(error: AppError, changed = false) {
    if (error.code === "JOIN_CODE_LOCKED") {
      const seconds = error.retryAfterSeconds ?? JOIN_CODE_LOCK_MINUTES * 60;
      setCodeError({ kind: "locked", until: Date.now() + seconds * 1000 });
    } else if (error.code === "JOIN_CODE_INVALID") {
      setCodeError(
        changed
          ? {
              kind: "changed",
              message: "가입코드가 바뀌었을 수 있어요. 집주인에게 새 코드를 받아 주세요",
            }
          : { kind: "invalid", message: "가입코드가 맞지 않아요. 받은 코드를 다시 확인해 주세요" },
      );
    } else {
      setCodeError({ kind: "other", message: errorMessage(error) });
    }
  }

  function onConnected(result: ConnectResult) {
    clearConnectDraft();
    // 다른 건물에서 옮기면 서버가 구독을 지웠으므로 이 브라우저 구독도 끊고 알림을 다시 묻습니다(D-18).
    if (result.endedOccupancyId) void forgetSubscription();
    // 다음 화면이 바로 거주자 홈으로 그려지도록 내 정보를 먼저 고쳐 둡니다(뒤에서 다시 받음).
    queryClient.setQueryData<Me | null>(authKeys.me(), (old) =>
      old
        ? {
            ...old,
            occupancy: { ...result.occupancy, buildingName: building.name },
          }
        : old,
    );
    const message = connectedToast(result, building.name);
    if (message) toast(message);
    const connected: ConnectedState = {
      buildingId: building.id,
      buildingName: building.name,
      first: !result.alreadyConnected,
    };
    void navigate(returnTo, { replace: true, state: { connected } });
  }

  /** 연결 요청. `from`은 누른 단계(1/2 코드에서 바로 연결했는지, 2/2 확인에서 눌렀는지). */
  async function runConnect(
    checkedCode: string,
    from: "code" | "account",
    replaceOccupancyId?: string,
  ) {
    if (connect.isPending) return;
    setConnectError(undefined);
    try {
      const result = await connect.mutateAsync({
        code: checkedCode,
        ...(replaceOccupancyId ? { replaceOccupancyId } : {}),
      });
      onConnected(result);
    } catch (caught) {
      const error = toAppError(caught);
      if (error.code === "JOIN_CODE_INVALID" || error.code === "JOIN_CODE_LOCKED") {
        // 확인 뒤 집주인이 코드를 바꿨을 수 있습니다(가입 중 코드 변경). 코드부터 다시 받습니다.
        clearConnectDraft();
        setDraft(undefined);
        if (from === "account") setCode("");
        setStep("code");
        showCodeError(error, from === "account");
        return;
      }
      const failure = connectFailureCopy(error, Boolean(replaceOccupancyId));
      if (failure.refetchMe) {
        // 로그인이 끝났거나 연결이 바뀌었을 수 있으면(결과를 모름 포함) 새로 받아 알맞은 화면을 다시 보여줍니다.
        // 사실 연결됐다면 새로 받은 내 정보로 ‘이미 연결돼 있어요’가 됩니다.
        void queryClient.invalidateQueries({ queryKey: authKeys.me() });
      }
      if (from === "code" && error.code !== "ALREADY_CONNECTED") {
        if (failure.uncertain) setCodeError({ kind: "other", message: failure.message });
        else showCodeError(error);
        return;
      }
      if (from === "code") {
        keepDraft(checkedCode, building.name);
        setStep("account");
      }
      setConnectError(failure.message);
    }
  }

  async function submitCode() {
    if (!isCompleteJoinCode(code) || check.isPending || connect.isPending) return;
    setCodeError(undefined);
    // 이미 로그인했고 옮길 연결이 없으면 로그인 단계를 건너뛰고 바로 연결합니다(screens.md 화면 규칙).
    if (me && !other) {
      await runConnect(code, "code");
      return;
    }
    try {
      const result = await check.mutateAsync(code);
      keepDraft(code, result.buildingName);
      setStep("account");
    } catch (caught) {
      showCodeError(toAppError(caught));
    }
  }

  if (step === "code") {
    return (
      <CodeStep
        building={building}
        returnTo={returnTo}
        code={code}
        onCodeChange={(value) => {
          setCode(value);
          if (codeError && codeError.kind !== "locked") setCodeError(undefined);
        }}
        error={codeError}
        onLockEnd={clearLock}
        pending={check.isPending || connect.isPending}
        onSubmit={() => void submitCode()}
        signedIn={me !== null}
        reconfirming={reconfirming}
      />
    );
  }

  const checked = draft ?? {
    buildingId: building.id,
    buildingName: building.name,
    code,
    returnTo,
    savedAt: Date.now(),
  };
  // 코드 단계로 돌아가면 확인해 둔 코드는 지웁니다(다시 ‘다음’을 누르면 새로 확인). 입력칸 값은 남깁니다.
  const backToCode = () => {
    clearConnectDraft();
    setDraft(undefined);
    setConnectError(undefined);
    setStep("code");
  };

  if (!me) {
    return (
      <LoginStep
        draft={checked}
        returnTo={returnTo}
        loginReturn={`${location.pathname}${location.search}`}
        onBack={backToCode}
      />
    );
  }
  if (other) {
    return (
      <SwitchStep
        building={building}
        draft={checked}
        current={other}
        returnTo={returnTo}
        pending={connect.isPending}
        error={connectError}
        onBack={backToCode}
        onKeep={() => {
          clearConnectDraft();
          void navigate(returnTo, { replace: true });
        }}
        onSwitch={() => void runConnect(checked.code, "account", other.id)}
      />
    );
  }
  return (
    <ConfirmStep
      building={building}
      draft={checked}
      returnTo={returnTo}
      pending={connect.isPending}
      error={connectError}
      onBack={backToCode}
      onConnect={() => void runConnect(checked.code, "account")}
    />
  );
}

/** 1/2 가입코드 확인 · lofi 02 */
function CodeStep({
  building,
  returnTo,
  code,
  onCodeChange,
  error,
  onLockEnd,
  pending,
  onSubmit,
  signedIn,
  reconfirming,
}: {
  building: PublicBuilding;
  returnTo: string;
  code: string;
  onCodeChange: (value: string) => void;
  error: CodeError | undefined;
  onLockEnd: () => void;
  pending: boolean;
  onSubmit: () => void;
  signedIn: boolean;
  reconfirming: boolean;
}) {
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const goBack = useGoBack(returnTo);
  const [focused, setFocused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const locked = error?.kind === "locked" && error.until > now;

  // 잠겨 있는 동안 남은 분을 새로 세고, Retry-After 시각이 되면 바로 다시 입력할 수 있게 합니다.
  useEffect(() => {
    if (error?.kind !== "locked") return;
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    const unlock = window.setTimeout(
      () => {
        setNow(Date.now());
        onLockEnd();
      },
      Math.max(0, error.until - Date.now()),
    );
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(unlock);
    };
  }, [error, onLockEnd]);

  const message =
    error?.kind === "locked"
      ? `여러 번 틀려서 ${Math.max(1, lockMinutesLeft(error.until, now))}분 뒤에 다시 넣을 수 있어요`
      : error?.message;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <ConnectShell
      returnTo={returnTo}
      onBack={() => {
        // 연결을 그만두고 나가면 로그인을 거치려고 남긴 코드도 지웁니다.
        clearConnectDraft();
        goBack();
      }}
    >
      <form className="wh-pad cn-body" onSubmit={handleSubmit} noValidate>
        <StepHead step={1} label="가입코드 확인" />

        <p className="cn-target">
          <span className="cn-target__mark">
            <Icon name="building-2" />
          </span>
          {building.name} · {building.displayAddress}
        </p>
        <h1 className="wh-h-title cn-title" tabIndex={-1}>
          이 건물에 살고 있나요?
        </h1>
        <p className="wh-body cn-lead">
          집주인이나 부동산에서 받은 6자리 가입코드를 넣으면 새 공지를 알림으로 받아요.
        </p>
        {reconfirming ? (
          <p className="wh-note cn-reconfirm">
            <Icon name="house" />
            <span>지금 가입코드를 다시 넣으면 이 건물에 계속 사는 것으로 확인해요.</span>
          </p>
        ) : null}

        <div className="cn-code">
          <label className="wh-visually-hidden" htmlFor={inputId}>
            가입코드 6자리
          </label>
          <input
            id={inputId}
            className="cn-code__input"
            value={code}
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={24}
            disabled={locked}
            aria-invalid={error && error.kind !== "other" ? true : undefined}
            aria-describedby={message ? `${errorId} ${helpId}` : helpId}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(event) => onCodeChange(sanitizeJoinCode(event.target.value))}
            onPaste={(event) => {
              event.preventDefault();
              onCodeChange(mergePastedJoinCode(code, event.clipboardData.getData("text")));
            }}
          />
          <CodeCells
            input
            value={code}
            activeIndex={focused && code.length < 6 ? code.length : undefined}
            invalid={Boolean(error) && error?.kind !== "other"}
          />
        </div>

        {message ? (
          <p id={errorId} className="wh-field-error cn-error" role="alert">
            {message}
          </p>
        ) : null}

        <p id={helpId} className="wh-note cn-help">
          <Icon name="info" />
          <span>
            영문과 숫자 6자리예요. 받은 코드를 통째로 붙여넣어도 돼요. 휴대폰 인증번호가 아니에요.
          </span>
        </p>

        <ActionButton
          type="submit"
          className="wh-btn cn-next"
          size="large"
          loading={pending}
          disabled={!isCompleteJoinCode(code) || pending || locked}
        >
          다음
        </ActionButton>

        {signedIn ? null : <SignInInstead returnTo={returnTo} />}

        <details className="cn-nocode">
          <summary className="cn-nocode__summary">코드를 받지 못했나요?</summary>
          <div className="cn-nocode__body">
            <p>
              가입코드는 집주인이나 부동산에서 받아요. 계약할 때 받은 입주 카드나 문자에 있을 수
              있어요.
            </p>
            <p>연결하지 않아도 이 건물 안내는 언제든 볼 수 있어요.</p>
            <Link className="cn-nocode__link" to={`/b/${building.id}`}>
              건물 안내 보기
              <Icon name="chevron-right" />
            </Link>
          </div>
        </details>
      </form>
    </ConnectShell>
  );
}

/**
 * 이미 연결한 사람이 다른 브라우저(예: 카카오톡에서 연결한 뒤 Safari)에서 열었을 때. 코드 없이 로그인만 하고
 * 보던 건물 화면으로 돌아갑니다. 연결돼 있으면 거주자 홈이, 아니면 공개 화면이 보입니다.
 */
function SignInInstead({ returnTo }: { returnTo: string }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<AppError>();
  const [asking, setAsking] = useState(false);
  const errorId = useId();

  // 카카오에서 뒤로 가기로 돌아오면(bfcache) 다시 누를 수 있게 합니다.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setStarting(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // 로그인 전이라 이 입구도 먼저 필수 동의를 받고 지금 판을 함께 보냅니다(D-28).
  async function start() {
    setStarting(true);
    setError(undefined);
    const failed = await startKakaoLogin(returnTo, TERMS_VERSION);
    if (failed) {
      setError(failed);
      setStarting(false);
    }
  }

  return (
    <div className="cn-signin">
      <button
        type="button"
        className="cn-signin__btn"
        disabled={starting}
        aria-describedby={error ? errorId : undefined}
        onClick={() => setAsking(true)}
      >
        이미 연결했어요 · 로그인
      </button>
      {error ? (
        <p id={errorId} className="wh-field-error" role="alert">
          {errorMessage(error)}
        </p>
      ) : null}
      <LoginConsentSheet
        open={asking}
        onOpenChange={setAsking}
        onAgree={() => {
          setAsking(false);
          void start();
        }}
      />
    </div>
  );
}

function CodeOk({ draft }: { draft: ConnectDraft }) {
  return (
    <p className="cn-code-ok">
      <Icon name="circle-check" />
      <span>
        {draft.buildingName} · 가입코드 <b>{draft.code}</b> 확인
      </span>
    </p>
  );
}

/** 2/2 로그인과 동의 · lofi 16. 로그인하고 돌아오면 같은 주소에서 ConfirmStep이 이어집니다. */
function LoginStep({
  draft,
  returnTo,
  loginReturn,
  onBack,
}: {
  draft: ConnectDraft;
  returnTo: string;
  loginReturn: string;
  onBack: () => void;
}) {
  const [consent, setConsent] = useState(NO_CONSENT);
  const [viewing, setViewing] = useState<ConsentDoc>("terms");
  const [docOpen, setDocOpen] = useState(false);
  const all = allAgreed(consent);
  return (
    <ConnectShell
      returnTo={returnTo}
      onBack={onBack}
      dock={
        <LoginActions
          returnTo={loginReturn}
          label="카카오로 계속하기"
          hint="카카오 로그인은 거주 여부를 확인하는 절차가 아니에요"
          demo={{ as: "demo-resident-b", label: "시연용 다음 입주자로 계속하기" }}
          blocked={!all}
          blockedReason="필수 항목에 동의하면 계속할 수 있어요"
          consent={TERMS_VERSION}
        />
      }
    >
      <div className="wh-pad cn-body">
        <StepHead step={2} label="로그인과 동의" />
        <h1 className="wh-h-title cn-title cn-title--step2" tabIndex={-1}>
          연결을 이어가려면
          <br />
          로그인이 필요해요
        </h1>
        <p className="wh-body cn-lead">다음에 들어올 때 코드를 다시 넣지 않아도 돼요.</p>

        <CodeOk draft={draft} />

        <ConsentChecks
          value={consent}
          onChange={setConsent}
          onView={(doc) => {
            setViewing(doc);
            setDocOpen(true);
          }}
        />
        <p className="wh-caption cn-consent-note">
          약관과 개인정보 처리방침은 법률 검토 전 초안이에요. 카카오에는 회원번호만 요청해요.
        </p>
        <p className="wh-caption cn-consent-note">공지 알림은 연결한 뒤에 따로 고를 수 있어요.</p>
      </div>
      <ConsentSheet doc={viewing} open={docOpen} onClose={() => setDocOpen(false)} />
    </ConnectShell>
  );
}

/** 로그인한 뒤 연결 확인. 자동으로 보내지 않고 한 번 더 눌러야 연결합니다(frontend.md §5). */
function ConfirmStep({
  building,
  draft,
  returnTo,
  pending,
  error,
  onBack,
  onConnect,
}: {
  building: PublicBuilding;
  draft: ConnectDraft;
  returnTo: string;
  pending: boolean;
  error: string | undefined;
  onBack: () => void;
  onConnect: () => void;
}) {
  return (
    <ConnectShell
      returnTo={returnTo}
      onBack={onBack}
      dock={
        <Dock error={error}>
          <ActionButton
            className="wh-btn"
            size="large"
            loading={pending}
            disabled={pending}
            onClick={onConnect}
          >
            {building.name}에 연결하기
          </ActionButton>
        </Dock>
      }
    >
      <div className="wh-pad cn-body">
        <StepHead step={2} label="연결 확인" />
        <h1 className="wh-h-title cn-title cn-title--step2" tabIndex={-1}>
          {building.name}에
          <br />
          연결할까요?
        </h1>
        <p className="wh-body cn-lead">
          연결하면 새 공지를 알림으로 받을 수 있고, 다음에 들어올 때 코드를 다시 넣지 않아도 돼요.
        </p>
        <CodeOk draft={draft} />
        <p className="wh-caption cn-consent-note">공지 알림은 연결한 뒤에 따로 고를 수 있어요.</p>
      </div>
    </ConnectShell>
  );
}

/** 기존 관계 변경 확인. 옮기지 않으면 지금 연결은 그대로이고, 새 연결이 실패해도 그대로입니다. */
function SwitchStep({
  building,
  draft,
  current,
  returnTo,
  pending,
  error,
  onBack,
  onKeep,
  onSwitch,
}: {
  building: PublicBuilding;
  draft: ConnectDraft;
  current: MeOccupancy;
  returnTo: string;
  pending: boolean;
  error: string | undefined;
  onBack: () => void;
  onKeep: () => void;
  onSwitch: () => void;
}) {
  return (
    <ConnectShell
      returnTo={returnTo}
      onBack={onBack}
      dock={
        <Dock error={error}>
          <div className="wh-btn-row">
            <ActionButton
              className="wh-btn wh-btn--neutral"
              size="large"
              variant="neutralWeak"
              disabled={pending}
              onClick={onKeep}
            >
              그대로 두기
            </ActionButton>
            <ActionButton
              className="wh-btn wh-grow"
              size="large"
              loading={pending}
              disabled={pending}
              onClick={onSwitch}
            >
              {withRo(building.name)} 옮기기
            </ActionButton>
          </div>
        </Dock>
      }
    >
      <div className="wh-pad cn-body">
        <StepHead step={2} label="연결 확인" />
        <h1 className="wh-h-title cn-title cn-title--step2" tabIndex={-1}>
          연결할 건물을
          <br />
          옮길까요?
        </h1>
        <p className="wh-body cn-lead">
          지금 <b>{current.buildingName}</b>에 연결돼 있어요. {withRo(building.name)} 옮기면{" "}
          {current.buildingName}의 새 공지 알림과 거주자 기능이 끝나요.
        </p>
        <CodeOk draft={draft} />
        <ul className="wh-tips cn-switch-info">
          <li>
            <Icon name="book-open" />
            {current.buildingName}의 안내는 연결하지 않아도 계속 볼 수 있어요
          </li>
          <li>
            <Icon name="shield-alert" />새 연결이 안 되면 {current.buildingName} 연결은 그대로 둬요
          </li>
        </ul>
      </div>
    </ConnectShell>
  );
}
