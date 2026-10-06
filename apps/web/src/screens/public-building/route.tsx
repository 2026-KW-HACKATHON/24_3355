// LF-01 공개 건물 화면 · lofi 01 28 (안내 없음 14, 건물 없음 22). 이 건물 거주자는 같은 주소에서 LF-05
import { ActionButton } from "@seed-design/react";
import {
  type Guide,
  type Me,
  type PublicBuilding,
  REPORT_PRESETS,
  type ReportPreset,
} from "@wolgyeham/contracts";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { BuildingScene } from "../../components/BuildingScene";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import {
  BackButton,
  Brand,
  Dock,
  hasAppHistory,
  LargeModeToggle,
  Screen,
  TopBar,
} from "../../components/Screen";
import { Delayed, EmptyState, LoadError } from "../../components/ScreenState";
import { BuildingNotFound } from "../../features/buildings/BuildingNotFound";
import { BuildingSkeleton } from "../../features/buildings/BuildingSkeleton";
import { GuideBigList, GuideRows, GuideTiles } from "../../features/buildings/GuideTiles";
import { usePublicBuilding, usePublicGuides } from "../../features/buildings/queries";
import { ShareButton } from "../../features/buildings/ShareButton";
import { hasSameCategory } from "../../features/guides/categories";
import { NoticeCards } from "../../features/notices/NoticeCards";
import { useNotices } from "../../features/notices/queries";
import { connectPath } from "../../features/occupancy/connectDraft";
import { REPORT_PRESET_COPY } from "../../features/reports/labels";
import { MyReportsBanner } from "../../features/reports/MyReportsBanner";
import { useMyReportsForBuilding } from "../../features/reports/queries";
import { ReportChooser } from "../../features/reports/ReportChooser";
import { ReportConfirmSheet } from "../../features/reports/ReportConfirmSheet";
import { toAppError } from "../../lib/errors";
import { useLargeMode } from "../../lib/largeMode";
import "./public-building.css";

/** 공개 화면 첫 방문에만 함이를 보여줍니다(재방문 30에는 넣지 않음). */
function useFirstVisit(buildingId: string, ready: boolean) {
  const key = `wh.visited.${buildingId}`;
  const [first] = useState(() => {
    try {
      return localStorage.getItem(key) === null;
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, "1");
    } catch {
      // 저장하지 못하면 다음에도 첫 방문으로 봅니다.
    }
  }, [key, ready]);
  return first;
}

/**
 * `me`는 주소 나누기(app/BuildingRoute)가 판정한 값입니다. 모르면(실패·늦음) null로 봅니다.
 * `viaQr`도 주소 나누기가 `?via=qr`을 읽어 넘깁니다(인쇄한 현관 QR로 열었을 때만 ‘현관 QR’ 배지).
 */
export function Component({ me = null, viaQr = false }: { me?: Me | null; viaQr?: boolean }) {
  const { buildingId = "" } = useParams();
  const building = usePublicBuilding(buildingId);
  const guides = usePublicGuides(buildingId);
  const notices = useNotices(buildingId);
  const large = useLargeMode();
  const ready = building.isSuccess && guides.isSuccess;
  const firstVisit = useFirstVisit(buildingId, ready);

  if (building.isError) {
    const { code } = toAppError(building.error);
    if (code === "NOT_FOUND" || code === "VALIDATION_FAILED") {
      return (
        <BuildingNotFound onRetry={() => void building.refetch()} retrying={building.isFetching} />
      );
    }
  }

  if (building.isError || guides.isError) {
    return (
      <PublicShell title={building.data?.name} manageId={undefined}>
        <LoadError
          retrying={building.isFetching || guides.isFetching}
          onRetry={() => {
            if (building.isError) void building.refetch();
            if (guides.isError) void guides.refetch();
          }}
        />
      </PublicShell>
    );
  }

  if (!ready) {
    return (
      <PublicShell busy manageId={undefined}>
        <Delayed label="건물 안내를 불러오는 중">
          <BuildingSkeleton />
        </Delayed>
      </PublicShell>
    );
  }

  // 집주인이 자기 건물 QR로 들어오면 같은 공개 화면에 본인에게만 ‘관리하기’를 둡니다(screens.md §5).
  const manageId = me?.managedBuildings.some((item) => item.id === buildingId)
    ? buildingId
    : undefined;

  const noticeSlot = (
    <NoticeCards
      notices={notices.data}
      failed={notices.isError}
      retrying={notices.isFetching}
      onRetry={() => void notices.refetch()}
    />
  );

  // 공개된 안내가 없어도 공지와 연결 카드는 그대로 둡니다(리뷰 L13).
  if (guides.data.length === 0) {
    return <NoGuides building={building.data} manageId={manageId} notice={noticeSlot} />;
  }

  return large ? (
    <LargeLayout
      building={building.data}
      guides={guides.data}
      notice={noticeSlot}
      manageId={manageId}
    />
  ) : (
    <DefaultLayout
      building={building.data}
      guides={guides.data}
      notice={noticeSlot}
      showHami={firstVisit}
      viaQr={viaQr}
      manageId={manageId}
    />
  );
}

/** 집주인 본인에게만 보이는 관리 입구. 권한은 관리 화면에서 서버가 다시 확인합니다. */
function ManageLink({ buildingId }: { buildingId: string }) {
  return (
    <Link className="wh-pill-btn pb-manage" to={`/manage/${buildingId}`}>
      <span className="wh-pill-btn__face">관리하기</span>
    </Link>
  );
}

function TopEnd({ title, manageId }: { title?: string | undefined; manageId: string | undefined }) {
  return (
    <>
      {manageId ? <ManageLink buildingId={manageId} /> : null}
      <LargeModeToggle />
      {title ? <ShareButton title={title} /> : null}
    </>
  );
}

function PublicShell({
  title,
  manageId,
  busy = false,
  children,
}: {
  title?: string | undefined;
  manageId: string | undefined;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      topbar={<TopBar start={<Brand />} end={<TopEnd title={title} manageId={manageId} />} />}
    >
      {children}
    </Screen>
  );
}

function DefaultLayout({
  building,
  guides,
  notice,
  showHami,
  viaQr,
  manageId,
}: {
  building: PublicBuilding;
  guides: Guide[];
  notice: ReactNode;
  showHami: boolean;
  viaQr: boolean;
  manageId: string | undefined;
}) {
  // ‘전체 보기’: 타일(종류)을 제목까지 보이는 목록으로 펼칩니다. 같은 종류가 여럿이면 이미 목록입니다.
  const [expanded, setExpanded] = useState(false);
  const rowsAlready = hasSameCategory(guides);
  // 자주 쓰는 말을 누르면(첫 번째 탭) 확인 시트(20), 시트의 ‘집주인에게 보내기’가 두 번째 탭입니다.
  // 닫히는 동안에도 문구가 보이도록 고른 말은 시트를 닫아도 남겨 둡니다.
  const [preset, setPreset] = useState<ReportPreset | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 재방문(30): ‘내가 보낸 내용’ 배너가 있으면(또는 자리를 잡아 두면) 건물 그림을 120px로 줄입니다(lofi 30).
  const mine = useMyReportsForBuilding(building.id);
  const hasBanner = mine.items.length > 0;
  const hero = useRef<HTMLDivElement>(null);
  // 자리를 잡아 둔 높이(배너 자리 + 그림 120px). 조회해 보니 보낸 내용이 없으면 이 높이를 그대로 두고 그림이
  // 배너 자리까지 채웁니다. 건물 이름 아래 내용은 움직이지 않습니다(CLS 0, frontend.md §5).
  const [reservedHeight, setReservedHeight] = useState<number>();
  useLayoutEffect(() => {
    if (!mine.reserve || hasBanner) return;
    const height = hero.current?.offsetHeight;
    if (height && height !== reservedHeight) setReservedHeight(height);
  });
  const filled = !mine.reserve && !hasBanner && reservedHeight !== undefined;
  const withBanner = hasBanner || mine.reserve;
  return (
    <Screen
      topbar={
        <TopBar start={<Brand />} end={<TopEnd title={building.name} manageId={manageId} />} />
      }
    >
      <div
        ref={hero}
        className="pb-hero"
        style={filled ? { minHeight: `${reservedHeight}px` } : undefined}
      >
        <MyReportsBanner buildingId={building.id} reserveForAccount />
        {/* 채울 때는 그림을 새로 붙입니다(같은 그림이 위로 옮겨 가면 밀림으로 셈). 나타남은 이미 한 번 보였습니다. */}
        <div
          key={filled ? "fill" : "flow"}
          className={
            filled
              ? "pb-scene pb-scene--fill"
              : withBanner
                ? "pb-scene pb-scene--return"
                : "pb-scene"
          }
        >
          <BuildingScene />
          {/* 재방문(30)에는 함이를 넣지 않습니다(함이 가이드 §4). 배너가 있으면 처음 방문이 아닙니다. */}
          {showHami && !withBanner ? (
            <div className="pb-scene__hami">
              <p className="wh-bubble wh-bubble--tail-left">이 건물의 안내와 소식을 확인해요.</p>
              <Hami pose="guide" size={104} eager />
            </div>
          ) : null}
        </div>
      </div>

      <div className="pb-building">
        <div className="pb-building__row">
          <h1 className="wh-h-display" tabIndex={-1}>
            {building.name}
          </h1>
          {viaQr ? (
            <span className="wh-badge wh-badge--navy">
              <Icon name="qr-code" />
              현관 QR
            </span>
          ) : null}
        </div>
        <p className="wh-small pb-building__address">
          {building.displayAddress} · 집주인이 관리하는 건물
        </p>
      </div>

      {notice}

      <section className="pb-section" aria-labelledby="pb-guides">
        <div className="wh-section-head">
          <h2 id="pb-guides">건물 안내</h2>
          {rowsAlready ? null : (
            <button
              type="button"
              className="wh-section-head__more pb-more"
              aria-expanded={expanded}
              aria-controls="pb-guide-list"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "접기" : "전체 보기"}
              <Icon name={expanded ? "chevron-up" : "chevron-right"} />
            </button>
          )}
        </div>
        <div id="pb-guide-list">
          {expanded ? (
            <GuideRows buildingId={building.id} guides={guides} />
          ) : (
            <GuideTiles buildingId={building.id} guides={guides} />
          )}
        </div>

        <Link className="pb-first" to={`/b/${building.id}/first`}>
          <Icon name="book-open" className="pb-first__lead" />
          <span className="pb-first__text">
            <span className="pb-first__title">처음 오셨나요?</span>
            <span className="pb-first__sub">
              이 건물 안내 {guides.length}개를 한 장씩 볼 수 있어요
            </span>
          </span>
          <Icon name="chevron-right" className="pb-first__chev" />
        </Link>
      </section>

      <ConnectCard buildingId={building.id} />

      <section className="pb-section pb-section--report" aria-labelledby="pb-report">
        <div className="wh-section-head">
          <h2 id="pb-report">집주인에게 바로 알리기</h2>
          <Link className="wh-section-head__more pb-more" to={`/b/${building.id}/report`}>
            직접 적기
            <Icon name="chevron-right" />
          </Link>
        </div>
        <ul className="pb-quick">
          {REPORT_PRESETS.map((key) => (
            <li key={key}>
              <button
                type="button"
                className="pb-quick__row"
                aria-haspopup="dialog"
                onClick={() => {
                  setPreset(key);
                  setConfirmOpen(true);
                }}
              >
                <span className="pb-quick__em">
                  <Icon name={REPORT_PRESET_COPY[key].icon} />
                </span>
                <span className="pb-quick__text">{REPORT_PRESET_COPY[key].text}</span>
                <span className="pb-quick__send">
                  보내기
                  <Icon name="chevron-right" />
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="pb-quick-note">
          <Icon name="eye-off" />
          가입하지 않아도 보낼 수 있어요 · 집주인만 봐요
        </p>
      </section>
      <ReportConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        buildingId={building.id}
        buildingName={building.name}
        draft={preset ? { source: "preset", preset } : null}
      />
    </Screen>
  );
}

/** 연결 카드(lofi 01) → LF-04. 공개 안내가 없어도 보입니다. */
function ConnectCard({ buildingId }: { buildingId: string }) {
  return (
    <Link className="pb-connect" to={connectPath(buildingId)}>
      <span className="pb-connect__ic">
        <Icon name="key-round" />
      </span>
      <span className="pb-connect__text">
        <span className="pb-connect__title">새 공지를 알림으로 받으려면</span>
        <span className="pb-connect__sub">이 건물에 살고 있다면 가입코드로 연결해요</span>
      </span>
      <span className="pb-connect__action">연결하기</span>
    </Link>
  );
}

// 크게 보기(lofi 28): 같은 행동을 모두 남기고 글자·누를 자리만 키웁니다. 건물 그림은 뺍니다.
function LargeLayout({
  building,
  guides,
  notice,
  manageId,
}: {
  building: PublicBuilding;
  guides: Guide[];
  notice: ReactNode;
  manageId: string | undefined;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  return (
    <Screen
      topbar={
        <TopBar start={<Brand />} end={<TopEnd title={building.name} manageId={manageId} />} />
      }
      dock={
        <Dock hint="가입하지 않아도 보낼 수 있어요">
          <ActionButton
            className="wh-btn"
            size="large"
            aria-haspopup="dialog"
            onClick={() => setReportOpen(true)}
          >
            <Icon name="mail" />
            집주인에게 알리기
          </ActionButton>
        </Dock>
      }
    >
      {/* 크게 보기에서도 ‘내가 보낸 내용’은 그대로 둡니다(screens.md 화면 규칙) */}
      <MyReportsBanner buildingId={building.id} />
      <div className="pb-building pb-building--large">
        <h1 className="wh-h-display" tabIndex={-1}>
          {building.name}
        </h1>
        <p className="wh-small pb-building__address">{building.displayAddress}</p>
      </div>

      {notice}

      <section className="pb-section" aria-labelledby="pb-guides-large">
        <div className="wh-section-head">
          <h2 id="pb-guides-large">건물 안내</h2>
          <Link
            className="wh-section-head__more pb-more pb-more--on"
            to={`/b/${building.id}/first`}
          >
            한 장씩 보기
            <Icon name="chevron-right" />
          </Link>
        </div>
        <GuideBigList buildingId={building.id} guides={guides} />
        <div className="bd-big-list pb-big-list--single">
          <Link className="bd-big-list__row" to={connectPath(building.id)}>
            <Icon name="key-round" className="bd-big-list__lead" />
            <span className="bd-big-list__text">
              새 공지 알림 받기
              <small>이 건물에 산다면 연결하기</small>
            </span>
            <Icon name="chevron-right" className="bd-big-list__chev" />
          </Link>
        </div>
      </section>
      <ReportChooser
        open={reportOpen}
        onOpenChange={setReportOpen}
        buildingId={building.id}
        buildingName={building.name}
      />
    </Screen>
  );
}

// 안내 없음 · lofi 14. preparing 건물의 QR도 여기로 옵니다(screens.md §3).
// 앱 안에서 넘어왔으면 lofi 14처럼 ‘‹ 건물 안내’, 현관 QR로 바로 열었으면 브랜드 막대입니다.
// 공지와 연결 카드는 안내가 없어도 그대로 둡니다.
function NoGuides({
  building,
  manageId,
  notice,
}: {
  building: PublicBuilding;
  manageId: string | undefined;
  notice: ReactNode;
}) {
  const [inApp] = useState(hasAppHistory);
  const [reportOpen, setReportOpen] = useState(false);
  return (
    <Screen
      topbar={
        <TopBar
          start={inApp ? <BackButton fallback="/" /> : <Brand />}
          title={inApp ? "건물 안내" : undefined}
          end={<TopEnd title={building.name} manageId={manageId} />}
        />
      }
      dock={
        <Dock hint="급한 일은 연락처 없이도 전할 수 있어요">
          <ActionButton
            className="wh-btn wh-btn--secondary"
            size="large"
            variant="neutralWeak"
            aria-haspopup="dialog"
            onClick={() => setReportOpen(true)}
          >
            <Icon name="mail" />
            집주인에게 알리기
          </ActionButton>
        </Dock>
      }
    >
      <MyReportsBanner buildingId={building.id} />
      <div className="wh-pad">
        <p className="wh-caption pb-empty-caption">
          {building.name} · {building.displayAddress}
        </p>
      </div>
      {notice}
      <div className="wh-pad">
        <div className="pb-empty">
          <EmptyState
            hami="folder"
            title="아직 등록된 안내가 없어요"
            description={"집주인이 안내를 등록하면\n여기에서 바로 볼 수 있어요."}
          />
        </div>
      </div>
      <ConnectCard buildingId={building.id} />
      <ReportChooser
        open={reportOpen}
        onOpenChange={setReportOpen}
        buildingId={building.id}
        buildingName={building.name}
      />
    </Screen>
  );
}
