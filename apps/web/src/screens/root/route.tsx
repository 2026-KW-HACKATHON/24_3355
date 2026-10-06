// `/` · 화면 없이 나누기만 합니다(frontend.md §4). 집주인은 관리 홈으로 보냅니다.
// 거주자 분기(스플래시 00 → /b/:buildingId)는 연결(LF-04)과 함께 만듭니다.
import { Navigate, useLocation } from "react-router";
import { Brand, LargeModeToggle, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState } from "../../components/ScreenState";
import { useMe } from "../../features/auth/queries";
import { LOGIN_RESULT_COPY, readLoginResult } from "../../features/auth/session";

export function Component() {
  const { search } = useLocation();
  const me = useMe();
  // 로그인 중 돌아올 곳을 잃으면(state 쿠키 만료) 서버가 `/?login=failed`로 보냅니다.
  const loginResult = readLoginResult(search);
  const first = me.data?.managedBuildings[0];
  if (first) return <Navigate replace to={`/manage/${first.id}`} />;
  return (
    <Screen busy={me.isPending} topbar={<TopBar start={<Brand />} end={<LargeModeToggle />} />}>
      {me.isPending ? (
        <Delayed>{null}</Delayed>
      ) : (
        <div className="wh-pad wh-state-top">
          {loginResult ? (
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
          />
        </div>
      )}
    </Screen>
  );
}
