// 집주인 설정 탭. lofi에 아직 없는 화면이라 지금 쓸 수 있는 것(건물 정보·크게 보기·약관·로그아웃)만 둡니다.
import { ActionButton } from "@seed-design/react";
import type { ManagedBuildingDetail } from "@wolgyeham/contracts";
import { Link, useNavigate, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { Screen, SoonNote, TopBar } from "../../components/Screen";
import { LandlordTabs } from "../../components/TabBar";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { useLogout } from "../../features/auth/queries";
import { errorMessage } from "../../lib/errors";
import { setLargeMode, useLargeMode } from "../../lib/largeMode";
import "./landlord-settings.css";

export function Component() {
  const { buildingId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>{(detail) => <Settings detail={detail} />}</ManagerGate>
  );
}

function Settings({ detail }: { detail: ManagedBuildingDetail }) {
  const { building } = detail;
  const navigate = useNavigate();
  const large = useLargeMode();
  const logout = useLogout();

  return (
    <Screen
      tabs={<LandlordTabs buildingId={building.id} active="settings" />}
      topbar={
        <TopBar
          start={
            <h1 className="wh-topbar__name" tabIndex={-1}>
              설정
            </h1>
          }
        />
      }
    >
      <p className="wh-group-title ls-first">건물</p>
      <div className="wh-list-row ls-static">
        <span className="wh-list-row__text">
          <span className="wh-list-row__title">{building.name}</span>
          <span className="wh-list-row__sub">{building.fullAddress}</span>
        </span>
      </div>

      <p className="wh-group-title">보기와 알림</p>
      <button
        type="button"
        className="wh-list-row"
        aria-pressed={large}
        onClick={() => setLargeMode(!large)}
      >
        <span className="wh-list-row__text">
          <span className="wh-list-row__title">크게 보기</span>
          <span className="wh-list-row__sub">글자와 버튼을 크게 보여줘요</span>
        </span>
        <span className="wh-list-row__value">{large ? "켜짐" : "꺼짐"}</span>
      </button>
      <button type="button" className="wh-list-row" disabled aria-describedby="ls-alert-soon">
        <span className="wh-list-row__text">
          <span className="wh-list-row__title">새 메모·제보 알림</span>
          <span className="wh-list-row__sub">
            파일럿 동안은 월계함 팀이 받은 내용을 카카오톡으로 전해요
          </span>
          <SoonNote id="ls-alert-soon" />
        </span>
      </button>

      <p className="wh-group-title">약관</p>
      <Link className="wh-list-row" to="/terms">
        <span className="wh-list-row__text">
          <span className="wh-list-row__title">서비스 이용약관</span>
          <span className="wh-list-row__sub">법률 검토 전 초안</span>
        </span>
        <span className="wh-list-row__value">
          <Icon name="chevron-right" />
        </span>
      </Link>
      <Link className="wh-list-row" to="/privacy">
        <span className="wh-list-row__text">
          <span className="wh-list-row__title">개인정보 처리방침</span>
          <span className="wh-list-row__sub">법률 검토 전 초안</span>
        </span>
        <span className="wh-list-row__value">
          <Icon name="chevron-right" />
        </span>
      </Link>

      <div className="wh-pad ls-logout">
        {logout.isError ? (
          <p className="wh-dock__error" role="alert">
            {errorMessage(logout.error)}. 이 기기에 남은 정보는 지웠어요
          </p>
        ) : null}
        <ActionButton
          className="wh-btn wh-btn--neutral"
          size="large"
          variant="neutralWeak"
          loading={logout.isPending}
          disabled={logout.isPending}
          onClick={() =>
            logout.mutate(undefined, {
              onSuccess: () => void navigate(`/b/${building.id}`, { replace: true }),
            })
          }
        >
          <Icon name="log-out" />
          로그아웃
        </ActionButton>
      </div>
    </Screen>
  );
}
