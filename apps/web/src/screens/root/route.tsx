// `/` · 화면 없이 나누기만 합니다(frontend.md §4). 홈 화면 아이콘(manifest start_url)도 여기로 옵니다.
// 집주인은 관리 홈, 거주자는 우리 건물(LF-05)로 보냅니다. 스플래시(00)는 앱 틀(app/Splash)이 덮습니다.
// 로그인이 끝난 홈 화면 앱이 막다른 곳이 되지 않게, 로그인 전이면 로그인과 내 정보로 가는 길을 둡니다.
import { ActionButton } from "@seed-design/react";
import { Link, Navigate, useLocation } from "react-router";
import { Icon } from "../../components/Icon";
import { Brand, LargeModeToggle, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError } from "../../components/ScreenState";
import { LoginActions } from "../../features/auth/LoginActions";
import { useMe } from "../../features/auth/queries";
import { LOGIN_RESULT_COPY, readLoginResult } from "../../features/auth/session";

export function Component() {
  const { search } = useLocation();
  const me = useMe();
  // 로그인 중 돌아올 곳을 잃으면(state 쿠키 만료) 서버가 `/?login=failed`로 보냅니다.
  const loginResult = readLoginResult(search);
  const first = me.data?.managedBuildings[0];
  if (first) return <Navigate replace to={`/manage/${first.id}`} />;
  const occupancy = me.data?.occupancy;
  if (occupancy) return <Navigate replace to={`/b/${occupancy.buildingId}`} />;
  const topbar = <TopBar start={<Brand />} end={<LargeModeToggle />} />;
  // 401만 로그인 전(me.data === null)입니다. 연결 문제·서버 오류를 로그인 전으로 보여주지 않습니다.
  if (me.isError) {
    return (
      <Screen topbar={topbar}>
        <LoadError onRetry={() => void me.refetch()} retrying={me.isFetching} />
      </Screen>
    );
  }
  if (me.isPending) {
    return (
      <Screen busy topbar={topbar}>
        <Delayed>{null}</Delayed>
      </Screen>
    );
  }
  const signedOut = me.data === null;
  return (
    <Screen
      topbar={topbar}
      dock={
        signedOut ? (
          <LoginActions
            returnTo="/"
            label="카카오로 로그인"
            hint="연결한 건물이나 관리하는 건물이 있으면 로그인한 뒤 바로 열려요"
            demo={{ as: "demo-resident-a", label: "시연용 거주자로 들어가기" }}
          />
        ) : undefined
      }
    >
      <div className="wh-pad wh-state-top">
        {/* 로그인 전이면 결과(?login=…)는 아래 로그인 버튼 위에서 알립니다. */}
        {loginResult && !signedOut ? (
          <p className="wh-dock__error" role="alert">
            {LOGIN_RESULT_COPY[loginResult]}
          </p>
        ) : null}
        <EmptyState
          icon="scan-line"
          title="현관 QR로 우리 건물을 열어 주세요"
          description={
            "건물마다 주소가 따로 있어요.\n현관이나 입주 카드의 QR을 찍으면 바로 열려요."
          }
        >
          <ActionButton
            asChild
            className="wh-btn wh-btn--secondary wh-btn--sm wh-gate-action"
            size="large"
            variant="neutralWeak"
          >
            <Link to="/me">
              <Icon name="user-round" />내 정보
            </Link>
          </ActionButton>
        </EmptyState>
      </div>
    </Screen>
  );
}
