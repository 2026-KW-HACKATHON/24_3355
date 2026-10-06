import { ActionButton } from "@seed-design/react";
import { Icon } from "../../components/Icon";
import { Brand, Dock, LargeModeToggle, Screen, TopBar } from "../../components/Screen";
import { EmptyState } from "../../components/ScreenState";

// 건물 없음 · lofi 22. QR 건물을 찾지 못했거나 주소가 잘못 열림. 제목은 lofi 22를 따릅니다.
export function BuildingNotFound({
  onRetry,
  retrying = false,
}: {
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <Screen
      topbar={<TopBar start={<Brand />} end={<LargeModeToggle />} />}
      dock={
        <Dock>
          <ActionButton
            className="wh-btn"
            size="large"
            loading={retrying}
            disabled={retrying}
            onClick={onRetry}
          >
            <Icon name="rotate-cw" />
            다시 시도
          </ActionButton>
        </Dock>
      }
    >
      <div className="wh-pad wh-state-top">
        <EmptyState
          hami="lost"
          title="건물 정보를 찾을 수 없어요"
          description="QR이 바뀌었거나 주소가 잘못 열렸을 수 있어요."
        />
        <ul className="wh-tips">
          <li>
            <Icon name="scan-line" />
            현관의 QR을 다시 찍어 주세요
          </li>
          <li>
            <Icon name="wifi" />
            연결이 불안정하면 잠시 뒤 다시 시도해 주세요
          </li>
        </ul>
      </div>
    </Screen>
  );
}
