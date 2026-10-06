import { Snackbar } from "@seed-design/react";
import { Link } from "react-router";
import { Icon, type IconName } from "./Icon";

// 하단 탭(lofi chrome.js TABS). 거주자 `우리 건물 · 내 정보`, 집주인 `건물 관리 · 받은 내용 · 설정`.
// 탭 첫 화면과 lofi가 탭을 그린 화면(07·35·37·21·내가 남긴 팁)에 붙입니다. 그 밖의 쓰기·상세 화면은 뒤로 가기로 돌아옵니다.
type Tab = { key: string; to: string; icon: IconName; label: string };

function TabBar({ tabs, active, label }: { tabs: readonly Tab[]; active: string; label: string }) {
  // 토스트는 탭 위에 뜹니다(SEED Snackbar.AvoidOverlap).
  return (
    <Snackbar.AvoidOverlap>
      <nav className="wh-tabbar" aria-label={label}>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to}
            className="wh-tabbar__tab"
            aria-current={tab.key === active ? "page" : undefined}
          >
            <Icon name={tab.icon} />
            {tab.label}
          </Link>
        ))}
      </nav>
    </Snackbar.AvoidOverlap>
  );
}

export function ResidentTabs({
  buildingId,
  active,
}: {
  buildingId: string;
  active: "building" | "me";
}) {
  return (
    <TabBar
      label="거주자 메뉴"
      active={active}
      tabs={[
        { key: "building", to: `/b/${buildingId}`, icon: "building-2", label: "우리 건물" },
        { key: "me", to: "/me", icon: "user-round", label: "내 정보" },
      ]}
    />
  );
}

export function LandlordTabs({
  buildingId,
  active,
}: {
  buildingId: string;
  active: "manage" | "inbox" | "settings";
}) {
  const base = `/manage/${buildingId}`;
  return (
    <TabBar
      label="집주인 메뉴"
      active={active}
      tabs={[
        { key: "manage", to: base, icon: "layout-grid", label: "건물 관리" },
        { key: "inbox", to: `${base}/inbox`, icon: "inbox", label: "받은 내용" },
        { key: "settings", to: `${base}/settings`, icon: "settings", label: "설정" },
      ]}
    />
  );
}
