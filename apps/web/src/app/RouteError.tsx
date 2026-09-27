import { ActionButton } from "@seed-design/react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { Icon } from "../components/Icon";
import { Brand, Dock, Screen, TopBar } from "../components/Screen";
import { EmptyState } from "../components/ScreenState";

// 화면 코드가 예상하지 못한 오류로 멈췄을 때(배포 뒤 화면 파일을 못 불러온 경우 포함).
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (import.meta.env.DEV && !notFound) console.error(error);
  return (
    <div className="wh-app">
      <Screen
        topbar={<TopBar start={<Brand />} />}
        dock={
          <Dock>
            <ActionButton className="wh-btn" size="large" onClick={() => window.location.reload()}>
              <Icon name="rotate-cw" />
              새로고침
            </ActionButton>
          </Dock>
        }
      >
        <div className="wh-pad wh-state-top">
          <EmptyState
            icon="triangle-alert"
            title={notFound ? "페이지를 찾을 수 없어요" : "화면을 여는 중에 문제가 생겼어요"}
            description="새로고침해도 계속되면 잠시 뒤 다시 열어 주세요."
          />
        </div>
      </Screen>
    </div>
  );
}
