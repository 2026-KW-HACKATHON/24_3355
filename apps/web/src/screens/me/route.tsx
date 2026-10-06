// LF-09 내 정보 · lofi 45. 보낸 내용 21(`/me/reports`)·내가 남긴 팁(`/me/tips`), 재확인 시트 40, 이사 확인 시트 08(끝나면 09 `/me/moved`)
import { ActionButton, Skeleton } from "@seed-design/react";
import type { Me } from "@wolgyeham/contracts";
import { type ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import { LegalLinks } from "../../components/LegalLinks";
import { Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError } from "../../components/ScreenState";
import { ResidentTabs } from "../../components/TabBar";
import { LoginActions } from "../../features/auth/LoginActions";
import { useLogout, useMe } from "../../features/auth/queries";
import { MoveOutSheet } from "../../features/occupancy/MoveOutSheet";
import { ReconfirmSheet } from "../../features/occupancy/ReconfirmSheet";
import { reconfirmState } from "../../features/occupancy/reconfirm";
import { NotifyChoiceSheet } from "../../features/push/NotifyChoiceSheet";
import { useNotifySheetState } from "../../features/push/notifyLink";
import { usePushEnv } from "../../features/push/queries";
import { useMyReports } from "../../features/reports/queries";
import { useMyTips } from "../../features/tips/queries";
import { errorMessage } from "../../lib/errors";
import { formatDay, formatMonth } from "../../lib/format";
import { setLargeMode, useLargeMode } from "../../lib/largeMode";
import type { PushEnv } from "../../lib/pushEnv";
import "./me.css";

export function Component() {
  const me = useMe();
  const location = useLocation();
  if (me.isError) {
    return (
      <MeShell>
        <LoadError onRetry={() => void me.refetch()} retrying={me.isFetching} />
      </MeShell>
    );
  }
  if (me.isPending) {
    return (
      <MeShell busy>
        <Delayed label="내 정보를 불러오는 중">
          <div className="wh-pad me-skeleton">
            <Skeleton radius="16" height="52px" width="60%" />
            <Skeleton radius="8" height="54px" />
            <Skeleton radius="8" height="54px" />
            <Skeleton radius="8" height="54px" />
          </div>
        </Delayed>
      </MeShell>
    );
  }
  if (me.data === null) {
    return (
      <MeShell
        dock={
          <LoginActions
            // 외부 브라우저로 연 `?notify=1`(알림 선택 바로 열기)을 로그인 뒤에도 잇습니다.
            returnTo={`/me${location.search}`}
            label="카카오로 로그인"
            demo={{ as: "demo-resident-a", label: "시연용 거주자로 들어가기" }}
          />
        }
      >
        <div className="wh-pad wh-state-top">
          <EmptyState
            icon="user-round"
            title="로그인이 필요해요"
            description={
              "내 정보는 로그인한 뒤에 볼 수 있어요.\n건물 안내는 로그인하지 않아도 볼 수 있어요."
            }
          />
        </div>
      </MeShell>
    );
  }
  return <MyInfo me={me.data} />;
}

function MeShell({
  busy = false,
  tabs,
  dock,
  children,
}: {
  busy?: boolean;
  tabs?: ReactNode;
  dock?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      tabs={tabs}
      dock={dock}
      topbar={
        <TopBar
          start={
            <h1 className="wh-topbar__name" tabIndex={-1}>
              내 정보
            </h1>
          }
        />
      }
    >
      {children}
    </Screen>
  );
}

function notifyValue(env: PushEnv | undefined): string {
  if (!env) return "";
  switch (env.kind) {
    case "enabled":
      return "켜짐";
    case "available":
      return "꺼짐";
    case "blocked":
      return "막힘";
    case "ios-install":
      return "홈 화면 추가 필요";
    case "in-app":
      return "이 앱에서는 못 켜요";
    case "unsupported":
      return "지원 안 됨";
  }
}

function MyInfo({ me }: { me: Me }) {
  const navigate = useNavigate();
  const occupancy = me.occupancy;
  const managed = me.managedBuildings[0];
  const large = useLargeMode();
  const [notifyOpen, setNotifyOpen] = useNotifySheetState();
  const [occupancySheet, setOccupancySheet] = useState<"reconfirm" | "moveOut" | null>(null);
  const push = usePushEnv(occupancy !== null && !notifyOpen);
  const logout = useLogout();
  const reconfirm = reconfirmState(occupancy);
  const myReports = useMyReports(me.user.id);
  const myTips = useMyTips(me.user.id);

  function signOut() {
    logout.mutate(undefined, {
      onSuccess: () => {
        void navigate(occupancy ? `/b/${occupancy.buildingId}` : "/", { replace: true });
      },
    });
  }

  return (
    <MeShell
      tabs={occupancy ? <ResidentTabs buildingId={occupancy.buildingId} active="me" /> : undefined}
    >
      {occupancy ? (
        <div className="me-profile">
          <span className="me-profile__av">
            <Icon name="building-2" />
          </span>
          <div>
            <p className="me-profile__name">{occupancy.buildingName}</p>
            <p className="wh-caption">
              {formatMonth(occupancy.connectedAt)}부터 연결 ·{" "}
              {reconfirm === "needed" ? (
                <span className="me-profile__warn">거주 확인 필요</span>
              ) : reconfirm === "requested" ? (
                <span className="me-profile__warn">거주 확인 요청</span>
              ) : (
                "거주 중"
              )}
            </p>
          </div>
        </div>
      ) : managed ? (
        // 집주인(연결한 건물 없음)에게는 거주자 안내 대신 관리하는 건물을 보여줍니다(리뷰 L16).
        <div className="me-profile">
          <span className="me-profile__av">
            <Icon name="building-2" />
          </span>
          <div>
            <p className="me-profile__name">{managed.name}</p>
            <p className="wh-caption">집주인으로 관리하는 건물이에요</p>
          </div>
        </div>
      ) : (
        <div className="me-profile">
          <span className="me-profile__av me-profile__av--none">
            <Icon name="user-round" />
          </span>
          <div>
            <p className="me-profile__name">연결한 건물이 없어요</p>
            <p className="wh-caption">현관 QR로 우리 건물을 열고 ‘연결하기’를 눌러 주세요.</p>
          </div>
        </div>
      )}
      <div className="wh-divider-thick" />

      {managed ? (
        <>
          <p className="wh-group-title">관리하는 건물</p>
          <Link className="wh-list-row" to={`/manage/${managed.id}`}>
            <span className="wh-list-row__text">
              <span className="wh-list-row__title">{managed.name}</span>
              <span className="wh-list-row__sub">건물 관리 홈으로</span>
            </span>
            <span className="wh-list-row__value">
              <Icon name="chevron-right" />
            </span>
          </Link>
        </>
      ) : null}

      <Link className="wh-list-row" to="/me/reports">
        <span className="wh-list-row__text">
          <span className="wh-list-row__title">보낸 내용</span>
        </span>
        <span className="wh-list-row__value">
          {myReports.data ? `${myReports.data.length}건` : ""}
          <Icon name="chevron-right" />
        </span>
      </Link>
      {occupancy || (myTips.data?.length ?? 0) > 0 ? (
        <Link className="wh-list-row" to="/me/tips">
          <span className="wh-list-row__text">
            <span className="wh-list-row__title">내가 남긴 팁</span>
            <span className="wh-list-row__sub">
              {occupancy ? "나에게만 보여요 · 고치거나 지울 수 있어요" : "나에게만 보여요"}
            </span>
          </span>
          <span className="wh-list-row__value">
            {myTips.data ? `${myTips.data.length}개` : ""}
            <Icon name="chevron-right" />
          </span>
        </Link>
      ) : null}

      <p className="wh-group-title">보기와 알림</p>
      {occupancy ? (
        // 재확인이 필요하면 서버가 알림 켜기를 막습니다(403). 알림 시트 대신 거주 확인(40)을 엽니다.
        <button
          type="button"
          className="wh-list-row"
          onClick={() =>
            reconfirm === "needed" ? setOccupancySheet("reconfirm") : setNotifyOpen(true)
          }
        >
          <span className="wh-list-row__text">
            <span className="wh-list-row__title">공지 알림</span>
            <span className="wh-list-row__sub">
              {reconfirm === "needed"
                ? "거주 확인 뒤 다시 켤 수 있어요"
                : push.env?.kind === "enabled"
                  ? "이 휴대폰에서 새 공지를 받아요"
                  : "새 공지를 이 휴대폰으로 받을지 골라요"}
            </span>
          </span>
          <span className="wh-list-row__value">
            {reconfirm === "needed" ? "멈춤" : notifyValue(push.env)}
            <Icon name="chevron-right" />
          </span>
        </button>
      ) : null}
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
        <span className={large ? "me-switch me-switch--on" : "me-switch"} aria-hidden="true">
          <span className="me-switch__thumb" />
        </span>
        <span className="wh-list-row__value me-switch__label">{large ? "켜짐" : "꺼짐"}</span>
      </button>

      {occupancy ? (
        <>
          <p className="wh-group-title">거주</p>
          {reconfirm === "none" ? (
            <div className="wh-list-row me-static">
              <span className="wh-list-row__text">
                <span className="wh-list-row__title">다음 거주 확인</span>
                <span className="wh-list-row__sub">1년에 한 번 ‘아직 살고 있나요?’를 물어요</span>
              </span>
              <span className="wh-list-row__value">{formatMonth(occupancy.nextReconfirmAt)}</span>
            </div>
          ) : (
            <button
              type="button"
              className="wh-list-row"
              onClick={() => setOccupancySheet("reconfirm")}
            >
              <span className="wh-list-row__text">
                <span className="wh-list-row__title">거주 확인</span>
                <span className="wh-list-row__sub">
                  {reconfirm === "needed"
                    ? "확인하기 전까지 새 글쓰기와 공지 알림이 멈춰 있어요"
                    : `${formatDay(occupancy.reconfirmDueAt)}까지 ‘아직 살아요’를 눌러 주세요`}
                </span>
              </span>
              <span className="wh-list-row__value me-warn-value">
                지금 확인
                <Icon name="chevron-right" />
              </span>
            </button>
          )}
          <button
            type="button"
            className="wh-list-row"
            onClick={() => setOccupancySheet("moveOut")}
          >
            <span className="wh-list-row__text">
              <span className="wh-list-row__title">이 건물에서 이사했어요</span>
            </span>
            <span className="wh-list-row__value">
              <Icon name="chevron-right" />
            </span>
          </button>
        </>
      ) : null}

      <div className="wh-pad me-logout">
        {logout.isError ? (
          <p className="wh-dock__error" role="alert">
            로그아웃하지 못했어요. {errorMessage(logout.error)}
          </p>
        ) : null}
        <ActionButton
          className="wh-btn wh-btn--neutral"
          size="large"
          variant="neutralWeak"
          loading={logout.isPending}
          disabled={logout.isPending}
          onClick={signOut}
        >
          <Icon name="log-out" />
          로그아웃
        </ActionButton>
        <p className="wh-caption me-logout__note">
          로그아웃하면 이 휴대폰의 공지 알림도 꺼져요. 연결한 건물은 그대로예요.
        </p>
      </div>
      <div className="wh-pad me-legal">
        <LegalLinks />
      </div>

      {occupancy ? (
        <>
          <NotifyChoiceSheet open={notifyOpen} onOpenChange={setNotifyOpen} context="settings" />
          <ReconfirmSheet
            open={occupancySheet === "reconfirm"}
            onOpenChange={(open) => setOccupancySheet(open ? "reconfirm" : null)}
            occupancy={occupancy}
            onMoveOut={() => setOccupancySheet("moveOut")}
          />
          <MoveOutSheet
            open={occupancySheet === "moveOut"}
            onOpenChange={(open) => setOccupancySheet(open ? "moveOut" : null)}
            occupancy={occupancy}
          />
        </>
      ) : null}
    </MeShell>
  );
}
