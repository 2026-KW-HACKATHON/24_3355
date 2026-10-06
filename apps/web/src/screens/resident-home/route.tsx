// LF-05 거주자 홈 · lofi 03(A, 다시 들어옴) 10(B, 연결 직후). 탭 `우리 건물`
// 재확인 요청이면 맨 위 배너 + 시트 40(앱을 연 뒤 한 번 먼저), ‘이사했어요’는 08
import type { Guide, MeOccupancy, PublicBuilding } from "@wolgyeham/contracts";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { useAutoSheetTurn } from "../../components/autoSheet";
import { BuildingScene } from "../../components/BuildingScene";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import { Brand, LargeModeToggle, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError } from "../../components/ScreenState";
import { ResidentTabs } from "../../components/TabBar";
import { useMe } from "../../features/auth/queries";
import { BuildingNotFound } from "../../features/buildings/BuildingNotFound";
import { BuildingSkeleton } from "../../features/buildings/BuildingSkeleton";
import { GuideBigList, GuideTiles } from "../../features/buildings/GuideTiles";
import { usePublicBuilding, usePublicGuides } from "../../features/buildings/queries";
import { NoticeCards } from "../../features/notices/NoticeCards";
import { useNotices } from "../../features/notices/queries";
import { readConnectedState } from "../../features/occupancy/connectedState";
import { MoveOutSheet } from "../../features/occupancy/MoveOutSheet";
import { ReconfirmSheet } from "../../features/occupancy/ReconfirmSheet";
import {
  markReconfirmAsked,
  reconfirmState,
  wasReconfirmAsked,
} from "../../features/occupancy/reconfirm";
import { NotifyChoiceSheet } from "../../features/push/NotifyChoiceSheet";
import { ReportChooser } from "../../features/reports/ReportChooser";
import { TipsPreview } from "../../features/tips/TipsPreview";
import { toAppError } from "../../lib/errors";
import { formatDay, formatMonth, isSameKstDay } from "../../lib/format";
import { useLargeMode } from "../../lib/largeMode";
import "./resident-home.css";

export function Component() {
  const { buildingId = "" } = useParams();
  const me = useMe();
  const building = usePublicBuilding(buildingId);
  const guides = usePublicGuides(buildingId);
  const occupancy = me.data?.occupancy;

  if (building.isError) {
    const { code } = toAppError(building.error);
    if (code === "NOT_FOUND" || code === "VALIDATION_FAILED") {
      return (
        <BuildingNotFound onRetry={() => void building.refetch()} retrying={building.isFetching} />
      );
    }
  }
  if (!occupancy) return null; // 주소 나누기(app/BuildingRoute)가 거주자에게만 이 화면을 보여줍니다.

  if (building.isError || guides.isError) {
    return (
      <HomeShell buildingId={buildingId}>
        <LoadError
          retrying={building.isFetching || guides.isFetching}
          onRetry={() => {
            if (building.isError) void building.refetch();
            if (guides.isError) void guides.refetch();
          }}
        />
      </HomeShell>
    );
  }
  if (!building.isSuccess || !guides.isSuccess) {
    return (
      <HomeShell buildingId={buildingId} busy>
        <Delayed label="우리 건물을 불러오는 중">
          <BuildingSkeleton resident />
        </Delayed>
      </HomeShell>
    );
  }
  return <ResidentHome building={building.data} guides={guides.data} occupancy={occupancy} />;
}

function HomeShell({
  buildingId,
  busy = false,
  onBell,
  children,
}: {
  buildingId: string;
  busy?: boolean;
  onBell?: () => void;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      tabs={<ResidentTabs buildingId={buildingId} active="building" />}
      topbar={
        <TopBar
          start={<Brand />}
          end={
            <>
              <LargeModeToggle />
              <button
                type="button"
                className="wh-icon-btn"
                aria-label="공지 알림 설정"
                disabled={!onBell}
                onClick={onBell}
              >
                <Icon name="bell" />
              </button>
            </>
          }
        />
      }
    >
      {children}
    </Screen>
  );
}

function ResidentHome({
  building,
  guides,
  occupancy,
}: {
  building: PublicBuilding;
  guides: Guide[];
  occupancy: MeOccupancy;
}) {
  const location = useLocation();
  const notices = useNotices(building.id);
  const large = useLargeMode();
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [occupancySheet, setOccupancySheet] = useState<"reconfirm" | "moveOut" | null>(null);
  // 40을 저절로 열었으면(하루 한 번) 다른 자동 시트와 차례를 맞춥니다. 이어서 연 이사(08)도 같은 차례로 봅니다.
  const [autoOpened, setAutoOpened] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // 함이 환영(10)은 이번에 새로 연결하고 돌아온 화면에서만 보여줍니다. 다시 들어오면(03) 건물 그림입니다.
  const connected = readConnectedState(location.state);
  const justConnected = connected?.buildingId === building.id && connected.first;
  const since = isSameKstDay(occupancy.connectedAt, Date.now())
    ? "오늘 연결"
    : `${formatMonth(occupancy.connectedAt)}부터 연결`;
  const reconfirm = reconfirmState(occupancy);

  // 재확인 시트(40)는 하루(한국 날짜)에 한 번만 먼저 띄웁니다. 연결 직후(알림 선택이 먼저)에는 띄우지 않습니다.
  useEffect(() => {
    if (reconfirm === "none" || justConnected || wasReconfirmAsked(occupancy)) return;
    markReconfirmAsked(occupancy);
    setOccupancySheet("reconfirm");
    setAutoOpened(true);
  }, [reconfirm, justConnected, occupancy]);
  const turn = useAutoSheetTurn("reconfirm", autoOpened && occupancySheet !== null);
  const sheetShown = !autoOpened || turn;
  const changeOccupancySheet = (next: "reconfirm" | "moveOut" | null) => {
    setOccupancySheet(next);
    if (next === null) setAutoOpened(false);
  };

  return (
    <HomeShell
      buildingId={building.id}
      // 재확인이 필요하면 알림을 켤 수 없어서(서버 403) 종 버튼은 거주 확인(40)을 엽니다.
      onBell={() =>
        reconfirm === "needed" ? changeOccupancySheet("reconfirm") : setNotifyOpen(true)
      }
    >
      {reconfirm === "none" ? null : (
        <button
          type="button"
          className={reconfirm === "needed" ? "rh-reconfirm rh-reconfirm--needed" : "rh-reconfirm"}
          onClick={() => changeOccupancySheet("reconfirm")}
        >
          <span className="rh-reconfirm__ic">
            <Icon name="house" />
          </span>
          <span className="rh-reconfirm__text">
            <span className="rh-reconfirm__title">
              {reconfirm === "needed"
                ? "거주 확인이 필요해요"
                : `아직 ${building.name}에 살고 있나요?`}
            </span>
            <span className="rh-reconfirm__sub">
              {reconfirm === "needed"
                ? "확인하기 전까지 새 글쓰기와 공지 알림이 멈춰 있어요"
                : `${formatDay(occupancy.reconfirmDueAt)}까지 한 번 답해 주세요`}
            </span>
          </span>
          <span className="rh-reconfirm__action">
            {reconfirm === "needed" ? "확인하기" : "답하기"}
          </span>
        </button>
      )}
      {justConnected ? (
        <div className="rh-welcome" role="status">
          <Hami pose="house" size={104} eager />
          <div>
            <p className="rh-welcome__title">{building.name}에 연결됐어요</p>
            <p className="rh-welcome__sub">새 공지가 올라오면 여기에서 먼저 보여요.</p>
          </div>
        </div>
      ) : large ? null : (
        <div className="rh-scene">
          <BuildingScene variant="home" />
        </div>
      )}

      <div className="rh-building">
        <div className="rh-building__row">
          <h1 className="wh-h-display" tabIndex={-1}>
            {building.name}
          </h1>
          {reconfirm === "needed" ? (
            <span className="wh-badge wh-badge--hard">
              <Icon name="house" />
              거주 확인 필요
            </span>
          ) : (
            <span className="wh-badge wh-badge--navy">
              <Icon name="house" />
              거주 중
            </span>
          )}
        </div>
        <p className="wh-small rh-building__sub">
          {building.displayAddress} · {since}
        </p>
      </div>

      {justConnected ? (
        <Link className="rh-first" to={`/b/${building.id}/first`}>
          <Icon name="book-open-check" className="rh-first__lead" />
          <span className="rh-first__text">처음 오셨나요? 안내를 한 장씩 넘겨 봐요</span>
          <Icon name="chevron-right" className="rh-first__chev" />
        </Link>
      ) : null}

      <NoticeCards
        notices={notices.data}
        failed={notices.isError}
        retrying={notices.isFetching}
        onRetry={() => void notices.refetch()}
      />

      <section className="rh-section" aria-labelledby="rh-guides">
        <div className="wh-section-head">
          <h2 id="rh-guides">건물 안내</h2>
          {guides.length > 0 && !justConnected ? (
            <Link className="wh-section-head__more rh-more" to={`/b/${building.id}/first`}>
              한 장씩 보기
              <Icon name="chevron-right" />
            </Link>
          ) : null}
        </div>
        {guides.length === 0 ? (
          <div className="wh-pad rh-empty">
            <EmptyState
              hami="folder"
              headingLevel={2}
              title="아직 등록된 안내가 없어요"
              description={"집주인이 안내를 등록하면\n여기에서 바로 볼 수 있어요."}
            />
          </div>
        ) : large ? (
          <GuideBigList buildingId={building.id} guides={guides} />
        ) : (
          <GuideTiles buildingId={building.id} guides={guides} />
        )}
      </section>

      <div className="rh-section">
        <TipsPreview buildingId={building.id} />
      </div>

      <div className="rh-report">
        <button type="button" className="rh-report__row" onClick={() => setReportOpen(true)}>
          <span className="rh-report__ic">
            <Icon name="mail" />
          </span>
          <span className="rh-report__text">
            <span className="rh-report__title">집주인에게 알리기</span>
            <span className="rh-report__sub">공용공간에서 생긴 일을 전해요</span>
          </span>
          <Icon name="chevron-right" className="rh-report__chev" />
        </button>
      </div>
      <ReportChooser
        open={reportOpen}
        onOpenChange={setReportOpen}
        buildingId={building.id}
        buildingName={building.name}
      />

      <NotifyChoiceSheet open={notifyOpen} onOpenChange={setNotifyOpen} context="settings" />
      <ReconfirmSheet
        open={occupancySheet === "reconfirm" && sheetShown}
        onOpenChange={(open) => changeOccupancySheet(open ? "reconfirm" : null)}
        occupancy={occupancy}
        onMoveOut={() => changeOccupancySheet("moveOut")}
      />
      <MoveOutSheet
        open={occupancySheet === "moveOut" && sheetShown}
        onOpenChange={(open) => changeOccupancySheet(open ? "moveOut" : null)}
        occupancy={occupancy}
      />
    </HomeShell>
  );
}
