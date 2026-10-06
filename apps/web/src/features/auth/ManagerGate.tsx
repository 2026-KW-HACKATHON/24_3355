import { ActionButton, Skeleton } from "@seed-design/react";
import type { ManagedBuildingDetail, Me } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Brand, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError } from "../../components/ScreenState";
import { toAppError } from "../../lib/errors";
import { useManagedBuilding } from "../buildings/queries";
import { LoginActions } from "./LoginActions";
import { useMe } from "./queries";

function GateShell({ busy = false, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <Screen
      busy={busy}
      topbar={
        <TopBar start={<Brand />} end={<span className="wh-badge wh-badge--gray">집주인용</span>} />
      }
    >
      {children}
    </Screen>
  );
}

function GateLoading() {
  return (
    <GateShell busy>
      <Delayed label="건물 정보를 불러오는 중">
        <div className="wh-pad wh-gate-skeleton">
          <Skeleton radius="16" height="96px" />
          <Skeleton radius="16" height="72px" />
          <Skeleton radius="16" height="220px" />
        </div>
      </Delayed>
    </GateShell>
  );
}

/** 로그인 필요(UNAUTHENTICATED). 로그인한 뒤 보던 화면으로 돌아옵니다. */
export function LoginRequired({ returnTo }: { returnTo: string }) {
  return (
    <Screen
      topbar={
        <TopBar start={<Brand />} end={<span className="wh-badge wh-badge--gray">집주인용</span>} />
      }
      dock={
        <LoginActions
          returnTo={returnTo}
          label="카카오로 로그인"
          hint="관리 권한은 초대받은 카카오 계정에만 생겨요"
        />
      }
    >
      <div className="wh-pad wh-state-top">
        <EmptyState
          icon="lock"
          title="로그인이 필요해요"
          description={"건물 관리 화면은 초대받은 카카오 계정으로\n로그인한 뒤에 볼 수 있어요."}
        />
      </div>
    </Screen>
  );
}

/** 로그인한 사람의 정보가 필요할 때. 로그인 전이면 로그인 안내를 보여줍니다. */
export function SignedInGate({ children }: { children: (me: Me) => ReactNode }) {
  const { pathname, search } = useLocation();
  const me = useMe();
  if (me.isError) {
    return (
      <GateShell>
        <LoadError onRetry={() => void me.refetch()} retrying={me.isFetching} />
      </GateShell>
    );
  }
  if (me.isPending) return <GateLoading />;
  if (me.data === null) return <LoginRequired returnTo={`${pathname}${search}`} />;
  return children(me.data);
}

/**
 * 집주인 화면의 공통 입구. 권한은 서버가 판정하고(NOT_BUILDING_MANAGER), 여기서는
 * 로그인 이동과 권한 없음 표시만 합니다(frontend.md §4).
 */
export function ManagerGate({
  buildingId,
  children,
}: {
  buildingId: string;
  children: (detail: ManagedBuildingDetail, me: Me) => ReactNode;
}) {
  return (
    <SignedInGate>
      {(me) => (
        <ManagedBuildingLoader buildingId={buildingId} me={me}>
          {children}
        </ManagedBuildingLoader>
      )}
    </SignedInGate>
  );
}

function ManagedBuildingLoader({
  buildingId,
  me,
  children,
}: {
  buildingId: string;
  me: Me;
  children: (detail: ManagedBuildingDetail, me: Me) => ReactNode;
}) {
  const { pathname, search } = useLocation();
  const detail = useManagedBuilding(buildingId);
  if (detail.isError) {
    const { code } = toAppError(detail.error);
    if (code === "UNAUTHENTICATED") return <LoginRequired returnTo={`${pathname}${search}`} />;
    if (code === "NOT_BUILDING_MANAGER" || code === "FORBIDDEN") {
      const mine = me.managedBuildings[0];
      return (
        <GateShell>
          <div className="wh-pad wh-state-top">
            <EmptyState
              icon="lock"
              title="이 건물을 관리할 권한이 없어요"
              description={"초대받은 카카오 계정으로 로그인했는지 확인해 주세요."}
            >
              {mine ? (
                <ActionButton
                  asChild
                  className="wh-btn wh-btn--secondary wh-btn--sm wh-gate-action"
                  size="large"
                  variant="neutralWeak"
                >
                  <Link to={`/manage/${mine.id}`}>{mine.name} 관리 홈으로</Link>
                </ActionButton>
              ) : null}
            </EmptyState>
          </div>
        </GateShell>
      );
    }
    if (code === "NOT_FOUND" || code === "VALIDATION_FAILED") {
      return (
        <GateShell>
          <div className="wh-pad wh-state-top">
            <EmptyState
              icon="building-2"
              title="이 건물을 찾을 수 없어요"
              description="주소가 잘못 열렸을 수 있어요."
            />
          </div>
        </GateShell>
      );
    }
    return (
      <GateShell>
        <LoadError onRetry={() => void detail.refetch()} retrying={detail.isFetching} />
      </GateShell>
    );
  }
  if (detail.isPending) return <GateLoading />;
  return children(detail.data, me);
}
