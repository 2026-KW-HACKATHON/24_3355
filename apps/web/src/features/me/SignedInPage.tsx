import type { Me } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { BackButton, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError, SkeletonLines } from "../../components/ScreenState";
import { LoginActions } from "../auth/LoginActions";
import { useMe } from "../auth/queries";

/**
 * 내 정보 아래 화면(보낸 내용 21·내가 남긴 팁)의 입구. 로그인 전이면 로그인한 뒤 이 화면으로 돌아옵니다.
 * 집주인용 입구(ManagerGate)와 문구가 달라 따로 둡니다.
 */
export function SignedInPage({
  title,
  back = "/me",
  children,
}: {
  title: string;
  back?: string;
  children: (me: Me) => ReactNode;
}) {
  const { pathname, search } = useLocation();
  const me = useMe();
  const topbar = <TopBar start={<BackButton fallback={back} />} title={title} titleAs="h1" />;
  if (me.isError) {
    return (
      <Screen topbar={topbar}>
        <LoadError headingLevel={2} onRetry={() => void me.refetch()} retrying={me.isFetching} />
      </Screen>
    );
  }
  if (me.isPending) {
    return (
      <Screen topbar={topbar} busy>
        <Delayed label={`${title}을 불러오는 중`}>
          <div className="wh-pad">
            <SkeletonLines lines={4} />
          </div>
        </Delayed>
      </Screen>
    );
  }
  if (me.data === null) {
    return (
      <Screen
        topbar={topbar}
        dock={
          <LoginActions
            returnTo={`${pathname}${search}`}
            label="카카오로 로그인"
            demo={{ as: "demo-resident-a", label: "시연용 거주자로 들어가기" }}
          />
        }
      >
        <div className="wh-pad wh-state-top">
          <EmptyState
            icon="user-round"
            headingLevel={2}
            title="로그인이 필요해요"
            description="로그인한 계정으로 남긴 내용만 여기에서 볼 수 있어요."
          />
        </div>
      </Screen>
    );
  }
  return children(me.data);
}
