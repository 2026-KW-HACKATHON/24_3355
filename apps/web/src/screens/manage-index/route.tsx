// `/manage` · 관리하는 첫 건물의 관리 홈(LF-13)으로 보냅니다. 여러 건물 선택은 파일럿 이후.
import { Navigate } from "react-router";
import { Brand, Screen, TopBar } from "../../components/Screen";
import { EmptyState } from "../../components/ScreenState";
import { NoManageActions, SignedInGate } from "../../features/auth/ManagerGate";

export function Component() {
  return (
    <SignedInGate>
      {(me) => {
        const first = me.managedBuildings[0];
        if (first) return <Navigate replace to={`/manage/${first.id}`} />;
        return (
          <Screen topbar={<TopBar start={<Brand />} />}>
            <div className="wh-pad wh-state-top">
              <EmptyState
                icon="building-2"
                title="관리하는 건물이 아직 없어요"
                description={"월계함 팀에게 받은 초대 링크로 들어오면\n그 건물을 관리할 수 있어요."}
              >
                <NoManageActions me={me} />
              </EmptyState>
            </div>
          </Screen>
        );
      }}
    </SignedInGate>
  );
}
