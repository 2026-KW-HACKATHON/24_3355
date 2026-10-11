// LF-20 시연 시작 · lofi 29. `/demo`는 DEMO_MODE API가 있을 때만 열리고(D-29), 실제 첫 화면에서 링크하지 않습니다.
// 역할 전환은 시연 로그인, ‘처음 상태로’는 시연 건물만 되돌리는 POST /api/dev/reset입니다.
import { ActionButton, Dialog, Portal, Skeleton } from "@seed-design/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type DemoOverview, TERMS_VERSION } from "@wolgyeham/contracts";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import { Screen } from "../../components/Screen";
import { Delayed, LoadError } from "../../components/ScreenState";
import {
  authKeys,
  demoLoginMutationOptions,
  logoutMutationOptions,
  useMe,
} from "../../features/auth/queries";
import { fetchMe } from "../../features/auth/session";
import { BuildingNotFound } from "../../features/buildings/BuildingNotFound";
import { usePublicGuides } from "../../features/buildings/queries";
import { useReport } from "../../features/reports/queries";
import { errorMessage, toAppError } from "../../lib/errors";
import {
  DEMO_TOUR,
  type DemoRole,
  demoDestination,
  demoHomeBuilding,
  demoKey,
  demoNeedsReset,
  demoResetMutationOptions,
  demoRoles,
  fetchDemoOverview,
  forgetDemoGuestLinks,
  guestReportRef,
  needsSwitchConfirm,
  resetErrorMessage,
  roleSubtitle,
} from "./demo";
import "./demo.css";

export function Component() {
  const overview = useQuery({ queryKey: demoKey, queryFn: fetchDemoOverview, retry: false });
  if (overview.isPending) {
    return (
      <Screen busy tone="gray">
        <Delayed label="시연 정보를 불러오는 중">
          <div className="wh-pad dm-skeleton">
            <Skeleton radius="8" height="28px" width="30%" />
            <Skeleton radius="16" height="72px" />
            <Skeleton radius="16" height="72px" />
            <Skeleton radius="16" height="72px" />
          </div>
        </Delayed>
      </Screen>
    );
  }
  if (overview.isError) {
    return (
      <Screen tone="gray">
        <LoadError onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
      </Screen>
    );
  }
  // 시연 모드가 아니면 없는 주소와 같게 보입니다.
  if (overview.data === null) return <BuildingNotFound onRetry={() => window.location.reload()} />;
  return <DemoStart overview={overview.data} />;
}

function DemoStart({ overview }: { overview: DemoOverview }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const login = useMutation(demoLoginMutationOptions(queryClient));
  const logout = useMutation(logoutMutationOptions(queryClient));
  const [picked, setPicked] = useState<string>();
  // 카카오 계정으로 로그인한 채 역할을 고르면 먼저 묻습니다(D-35). 고른 역할을 여기 두었다가 ‘시연 보기’로 이어 갑니다.
  const [confirming, setConfirming] = useState<{ role: DemoRole; key: string }>();
  const inFlight = useRef(false);
  const roles = demoRoles(overview);
  const home = demoHomeBuilding(overview);
  // 옆 건물 주민 카드에 그 제보의 지금 상태(접수됨·확인함·처리 완료)를 적습니다. 못 읽으면 상태 없이 둡니다.
  const guestRef = guestReportRef(overview);
  const guestReport = useReport(guestRef?.reportId ?? "", guestRef?.token, Boolean(guestRef));
  // 시연 건물에 공개 안내가 남아 있는지(초기화가 필요한지) 봅니다. 못 읽으면 그 조건은 넘어갑니다.
  const homeGuides = usePublicGuides(home?.id ?? "", Boolean(home));
  const needsReset = demoNeedsReset(overview, homeGuides.data?.length);
  const demoNames = overview.buildings
    .filter((building) => building.purpose === "demo")
    .map((building) => building.name)
    .join("·");

  async function choose(role: DemoRole, key: string) {
    if (inFlight.current) return;
    // 다른 탭에서 카카오로 로그인했을 수 있어 고르기 직전에 내 정보를 새로 받아 판단합니다.
    const fresh = await queryClient
      .fetchQuery({ queryKey: authKeys.me(), queryFn: fetchMe, staleTime: 0 })
      .catch(() => me.data);
    if (needsSwitchConfirm(fresh)) {
      setConfirming({ role, key });
      return;
    }
    void switchTo(role, key, false);
  }

  /**
   * 역할로 바꿉니다. `fromRealAccount`면 카카오 계정에서 먼저 로그아웃하는데, 그 계정의 연결·알림 구독은 그대로
   * 둡니다(`keepPush`: 서버 구독도, 이 휴대폰의 구독도 지우지 않음). 시연 중·로그인 전에는 묻지 않고 바로 바꿉니다.
   */
  async function switchTo(role: DemoRole, key: string, fromRealAccount: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPicked(key);
    login.reset();
    logout.reset();
    try {
      if (fromRealAccount) await logout.mutateAsync({ keepPush: true });
      if (role.kind === "guest") {
        if (me.data && !fromRealAccount) await logout.mutateAsync(undefined);
        void navigate(demoDestination(role, null, overview));
      } else {
        // 시연 계정이라 약관 판을 함께 남겨, 역할을 바꿀 때마다 다시 동의 시트가 뜨지 않게 합니다.
        // 시연 계정이면 내 정보의 `user.demo`로 ‘시연 중 · 역할’ 막대(components/DemoBar)가 뜹니다.
        const next = await login.mutateAsync({ as: role.account.as, consent: TERMS_VERSION });
        forgetDemoGuestLinks(overview);
        void navigate(demoDestination(role, next, overview));
      }
    } catch {
      // 아래 문구로 남깁니다.
    } finally {
      inFlight.current = false;
      setPicked(undefined);
    }
  }

  const busy = login.isPending || logout.isPending;
  const chooseError = login.error ?? logout.error;

  return (
    <Screen tone="gray">
      <div className="wh-pad dm-body">
        <span className="dm-tag">
          <Icon name="presentation" />
          시연용 데이터
        </span>
        <p className="dm-banner" role="note">
          시연용 주소예요. {demoNames || "시연 건물"}의 가상 데이터만 쓰고, 실제 서비스 건물과
          섞이지 않아요.
        </p>
        <div className="dm-head">
          <h1 className="wh-h-title" tabIndex={-1}>
            누구의 화면으로
            <br />
            볼까요?
          </h1>
          <Hami pose="wave" size={110} eager />
        </div>
        <p className="wh-small dm-lead">
          역할을 바꿔도 {home?.name ?? "시연 건물"}의 안내와 제보 상태는 그대로 이어져요.
        </p>

        <section className="dm-tour" aria-labelledby="dm-tour-title">
          <h2 id="dm-tour-title" className="dm-tour__title">
            둘러보는 순서
          </h2>
          <ol className="dm-tour__steps">
            {DEMO_TOUR.map((step, index) => (
              <li key={step.who} className="dm-tour__step">
                <span className="dm-tour__num" aria-hidden="true">
                  {index + 1}
                </span>
                <span>
                  <strong>{step.who}</strong>: {step.what}
                </span>
              </li>
            ))}
          </ol>
          <p className="dm-tour__caption">
            시연은 둘러보기만 할 수 있어요. 실제로 해 보려면 부스 입구의 QR을 찍어 주세요.
          </p>
        </section>

        {chooseError ? (
          <p className="wh-dock__error dm-error" role="alert">
            {toAppError(chooseError).code === "NOT_FOUND"
              ? "시연 계정을 찾지 못했어요. ‘처음 상태로’를 누른 뒤 다시 골라 주세요"
              : errorMessage(chooseError)}
          </p>
        ) : null}

        {me.isError ? (
          // 로그인 상태를 모르면 카카오 계정인지(전환 전에 물을지) 알 수 없어 역할을 고르지 않게 합니다.
          <p className="wh-dock__error dm-error" role="alert">
            로그인 상태를 확인하지 못했어요.{" "}
            <button type="button" className="wh-text-action" onClick={() => void me.refetch()}>
              다시 확인
            </button>
          </p>
        ) : null}

        <ul className="dm-roles">
          {roles.map((role) => {
            const key = role.kind === "guest" ? "guest" : role.account.as;
            return (
              <li key={key}>
                <button
                  type="button"
                  className="dm-role"
                  disabled={busy || me.isPending || me.isError}
                  aria-busy={picked === key || undefined}
                  onClick={() => void choose(role, key)}
                >
                  <RoleAvatar role={role} />
                  <span className="dm-role__text">
                    <span className="dm-role__title">
                      {role.kind === "guest" ? "옆 건물 주민" : role.account.label}
                    </span>
                    <span className="dm-role__sub">
                      {roleSubtitle(role, overview, guestReport.data?.status)}
                    </span>
                  </span>
                  {picked === key ? (
                    <span className="dm-role__state">여는 중</span>
                  ) : (
                    <Icon name="chevron-right" className="dm-role__chev" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="dm-drift" role="status">
          {needsReset ? (
            <>
              <Icon name="triangle-alert" />
              <span>시연 상태가 바뀌었어요 · 운영자가 ‘시연 초기화’를 눌러 주세요</span>
            </>
          ) : null}
        </p>
        <ResetBox />
      </div>
      <Dialog.Root
        open={confirming !== undefined}
        onOpenChange={(next) => {
          if (!next) setConfirming(undefined);
        }}
      >
        <Portal>
          <Dialog.Positioner>
            <Dialog.Backdrop />
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>카카오 계정으로 로그인돼 있어요</Dialog.Title>
                <Dialog.Description>
                  시연을 보면 지금 계정에서 로그아웃돼요. 연결과 알림 설정은 그대로 남아요.
                </Dialog.Description>
              </Dialog.Header>
              <Dialog.Footer>
                <div className="wh-btn-row">
                  <ActionButton
                    className="wh-btn wh-btn--neutral"
                    size="large"
                    variant="neutralWeak"
                    onClick={() => setConfirming(undefined)}
                  >
                    그만두기
                  </ActionButton>
                  <ActionButton
                    className="wh-btn"
                    size="large"
                    onClick={() => {
                      const next = confirming;
                      setConfirming(undefined);
                      if (next) void switchTo(next.role, next.key, true);
                    }}
                  >
                    시연 보기
                  </ActionButton>
                </div>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Screen>
  );
}

function RoleAvatar({ role }: { role: DemoRole }) {
  if (role.kind === "guest") {
    return (
      <span className="dm-av dm-av--gray" aria-hidden="true">
        <Icon name="footprints" />
      </span>
    );
  }
  if (role.account.role === "landlord") {
    return (
      <span className="dm-av dm-av--moon" aria-hidden="true">
        <Icon name="key-round" />
      </span>
    );
  }
  const letter = role.account.as === "demo-resident-b" ? "B" : "A";
  return (
    <span className="dm-av dm-av--navy" aria-hidden="true">
      {letter}
    </span>
  );
}

/** ‘처음 상태로’: 확인 대화상자 → 시연 건물 되돌리기 → 캐시·이 기기의 시연 흔적 지우기. */
function ResetBox() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const reset = useMutation(demoResetMutationOptions(queryClient));

  async function handleReset() {
    setDone(false);
    try {
      await reset.mutateAsync();
      setOpen(false);
      setDone(true);
    } catch {
      setOpen(false);
    }
  }

  const message = reset.error ? resetErrorMessage(reset.error) : undefined;

  return (
    <div className="dm-reset">
      <div className="dm-reset__row">
        <span className="dm-reset__label">운영자용 · 처음 상태로 되돌리기</span>
        <button
          type="button"
          className="wh-text-action dm-reset__btn"
          disabled={reset.isPending}
          onClick={() => {
            reset.reset();
            setDone(false);
            setOpen(true);
          }}
        >
          시연 초기화
        </button>
      </div>
      <p className="dm-reset__status" role="status">
        {done ? "처음 상태로 되돌렸어요" : ""}
      </p>
      {message ? (
        <p className="wh-field-error" role="alert">
          {message}
        </p>
      ) : null}
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!reset.isPending) setOpen(next);
        }}
      >
        <Portal>
          <Dialog.Positioner>
            <Dialog.Backdrop />
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>시연 데이터를 처음 상태로 되돌릴까요?</Dialog.Title>
                <Dialog.Description>
                  시연 건물의 안내·공지·메모·제보·팁·연결이 처음 시드한 상태로 돌아가요. 시연 중에
                  만든 내용은 지워지고, 실제 서비스 데이터는 건드리지 않아요.
                </Dialog.Description>
              </Dialog.Header>
              <Dialog.Footer>
                <div className="wh-btn-row">
                  <ActionButton
                    className="wh-btn wh-btn--neutral"
                    size="large"
                    variant="neutralWeak"
                    disabled={reset.isPending}
                    onClick={() => setOpen(false)}
                  >
                    그대로 두기
                  </ActionButton>
                  <ActionButton
                    className="wh-btn"
                    size="large"
                    variant="criticalSolid"
                    loading={reset.isPending}
                    disabled={reset.isPending}
                    onClick={() => void handleReset()}
                  >
                    처음 상태로
                  </ActionButton>
                </div>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </div>
  );
}
