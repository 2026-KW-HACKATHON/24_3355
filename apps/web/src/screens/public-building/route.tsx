// LF-01 공개 건물 화면 · lofi 01 28 (안내 없음 14, 건물 없음 22)
import { ActionButton, Skeleton } from "@seed-design/react";
import type { Guide, Notice, PublicBuilding } from "@wolgyeham/contracts";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { BuildingScene } from "../../components/BuildingScene";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import { Brand, Dock, LargeModeToggle, Screen, SoonNote, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError } from "../../components/ScreenState";
import { BuildingNotFound } from "../../features/buildings/BuildingNotFound";
import {
  useCurrentNotice,
  usePublicBuilding,
  usePublicGuides,
} from "../../features/buildings/queries";
import { ShareButton } from "../../features/buildings/ShareButton";
import { CATEGORY, tileLabels } from "../../features/guides/categories";
import { toAppError } from "../../lib/errors";
import { formatDay } from "../../lib/format";
import { useLargeMode } from "../../lib/largeMode";
import "./public-building.css";

// 자주 쓰는 말(lofi 01). 보내기(LF-10)는 다음 업데이트에서 엽니다.
const QUICK_REPORTS = [
  { icon: "trash-2", text: "건물 앞 쓰레기가 넘쳤어요" },
  { icon: "ban", text: "통로를 막는 물건이 있어요" },
  { icon: "droplets", text: "물이 새거나 고장 났어요" },
] as const;

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

export function Component() {
  const { buildingId = "" } = useParams();
  const building = usePublicBuilding(buildingId);
  const guides = usePublicGuides(buildingId);
  const notice = useCurrentNotice(buildingId);
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
      <PublicShell title={building.data?.name}>
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
      <PublicShell busy>
        <Delayed label="건물 안내를 불러오는 중">
          <PublicSkeleton />
        </Delayed>
      </PublicShell>
    );
  }

  if (guides.data.length === 0) return <NoGuides building={building.data} />;

  const noticeSlot = (
    <NoticeSlot
      notice={notice.data}
      failed={notice.isError}
      retrying={notice.isFetching}
      onRetry={() => void notice.refetch()}
    />
  );

  return large ? (
    <LargeLayout building={building.data} guides={guides.data} notice={noticeSlot} />
  ) : (
    <DefaultLayout
      building={building.data}
      guides={guides.data}
      notice={noticeSlot}
      showHami={firstVisit}
    />
  );
}

function PublicShell({
  title,
  busy = false,
  children,
}: {
  title?: string | undefined;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      topbar={
        <TopBar
          start={<Brand />}
          end={
            <>
              <LargeModeToggle />
              {title ? <ShareButton title={title} /> : null}
            </>
          }
        />
      }
    >
      {children}
    </Screen>
  );
}

function PublicSkeleton() {
  return (
    <div className="pb-skeleton">
      <Skeleton radius="16" height="150px" width="100%" />
      <div className="pb-skeleton__body">
        <Skeleton radius="8" height="34px" width="45%" />
        <Skeleton radius="8" height="20px" width="80%" />
        <Skeleton radius="16" height="64px" />
        <div className="pb-skeleton__tiles">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton key={key} radius="16" height="78px" />
          ))}
        </div>
      </div>
    </div>
  );
}

function NoticeSlot({
  notice,
  failed,
  retrying,
  onRetry,
}: {
  notice: Notice | null | undefined;
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (failed) {
    return (
      <div className="pb-notice pb-notice--failed" role="status">
        <span className="pb-notice__ic">
          <Icon name="wifi-off" />
        </span>
        <p className="pb-notice__text">공지를 불러오지 못했어요</p>
        <button type="button" className="pb-notice__retry" onClick={onRetry} disabled={retrying}>
          다시 시도
        </button>
      </div>
    );
  }
  if (!notice) return null;
  // 공지 상세(LF-03)는 아직 없어서 누르는 곳이 아니라 알림 카드로 둡니다.
  return (
    <section className="pb-notice" aria-label="공지">
      <span className="pb-notice__ic">
        <Icon name="megaphone" />
      </span>
      <div className="pb-notice__text">
        <p className="pb-notice__title">{notice.title}</p>
        <p className="pb-notice__sub">공지 · {formatDay(notice.endsAt)}까지</p>
      </div>
    </section>
  );
}

function DefaultLayout({
  building,
  guides,
  notice,
  showHami,
}: {
  building: PublicBuilding;
  guides: Guide[];
  notice: ReactNode;
  showHami: boolean;
}) {
  const labels = tileLabels(guides);
  return (
    <Screen
      topbar={
        <TopBar
          start={<Brand />}
          end={
            <>
              <LargeModeToggle />
              <ShareButton title={building.name} />
            </>
          }
        />
      }
    >
      <div className="pb-scene">
        <BuildingScene />
        {showHami ? (
          <div className="pb-scene__hami">
            <p className="wh-bubble wh-bubble--tail-left">이 건물의 안내와 소식을 확인해요.</p>
            <Hami pose="guide" size={104} eager />
          </div>
        ) : null}
      </div>

      <div className="pb-building">
        <h1 className="wh-h-display" tabIndex={-1}>
          {building.name}
        </h1>
        <p className="wh-small pb-building__address">
          {building.displayAddress} · 집주인이 관리하는 건물
        </p>
      </div>

      {notice}

      <section className="pb-section" aria-labelledby="pb-guides">
        <div className="wh-section-head">
          <h2 id="pb-guides">건물 안내</h2>
        </div>
        <ul className="pb-tiles">
          {guides.map((guide) => (
            <li key={guide.id}>
              <Link
                className="pb-tile"
                to={`/b/${building.id}/guides/${guide.id}`}
                aria-label={`${labels.get(guide.id)}: ${guide.title}`}
              >
                <span className="pb-tile__ic">
                  <Icon name={CATEGORY[guide.category].icon} />
                </span>
                <span className="pb-tile__label">{labels.get(guide.id)}</span>
              </Link>
            </li>
          ))}
        </ul>

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

      <div className="pb-connect">
        <span className="pb-connect__ic">
          <Icon name="key-round" />
        </span>
        <div className="pb-connect__text">
          <p className="pb-connect__title">새 공지를 알림으로 받으려면</p>
          <p className="pb-connect__sub">이 건물에 살고 있다면 가입코드로 연결해요</p>
          <SoonNote id="pb-connect-soon" />
        </div>
        <button
          type="button"
          className="pb-connect__action"
          disabled
          aria-describedby="pb-connect-soon"
        >
          연결하기
        </button>
      </div>

      <section className="pb-section pb-section--report" aria-labelledby="pb-report">
        <div className="wh-section-head">
          <h2 id="pb-report">집주인에게 바로 알리기</h2>
          <button
            type="button"
            className="wh-section-head__more pb-more"
            disabled
            aria-describedby="pb-report-soon"
          >
            직접 적기
            <Icon name="chevron-right" />
          </button>
        </div>
        <ul className="pb-quick">
          {QUICK_REPORTS.map((item) => (
            <li key={item.text}>
              <button
                type="button"
                className="pb-quick__row"
                disabled
                aria-describedby="pb-report-soon"
              >
                <span className="pb-quick__em">
                  <Icon name={item.icon} />
                </span>
                <span className="pb-quick__text">{item.text}</span>
                <span className="pb-quick__send">
                  보내기
                  <Icon name="chevron-right" />
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="pb-quick-note">
          <SoonNote id="pb-report-soon">알리기는 다음 업데이트에서 열려요</SoonNote>
        </p>
      </section>
    </Screen>
  );
}

// 크게 보기(lofi 28): 같은 행동을 모두 남기고 글자·누를 자리만 키웁니다. 건물 그림은 뺍니다.
function LargeLayout({
  building,
  guides,
  notice,
}: {
  building: PublicBuilding;
  guides: Guide[];
  notice: ReactNode;
}) {
  const labels = tileLabels(guides);
  return (
    <Screen
      topbar={
        <TopBar
          start={<Brand />}
          end={
            <>
              <LargeModeToggle />
              <ShareButton title={building.name} />
            </>
          }
        />
      }
      dock={
        <Dock
          hint={<SoonNote id="pb-large-report-soon">알리기는 다음 업데이트에서 열려요</SoonNote>}
        >
          <ActionButton
            className="wh-btn"
            size="large"
            disabled
            aria-describedby="pb-large-report-soon"
          >
            <Icon name="mail" />
            집주인에게 알리기
          </ActionButton>
        </Dock>
      }
    >
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
        <ul className="pb-big-list">
          {guides.map((guide) => (
            <li key={guide.id}>
              <Link
                className="pb-big-list__row"
                to={`/b/${building.id}/guides/${guide.id}`}
                aria-label={`${labels.get(guide.id)}: ${guide.title}`}
              >
                <Icon name={CATEGORY[guide.category].icon} className="pb-big-list__lead" />
                <span className="pb-big-list__text">{labels.get(guide.id)}</span>
                <Icon name="chevron-right" className="pb-big-list__chev" />
              </Link>
            </li>
          ))}
        </ul>
        <div className="pb-big-list pb-big-list--single">
          <button
            type="button"
            className="pb-big-list__row"
            disabled
            aria-describedby="pb-large-connect-soon"
          >
            <Icon name="key-round" className="pb-big-list__lead" />
            <span className="pb-big-list__text">
              새 공지 알림 받기
              <small>이 건물에 산다면 연결하기</small>
              <SoonNote id="pb-large-connect-soon" />
            </span>
            <Icon name="chevron-right" className="pb-big-list__chev" />
          </button>
        </div>
      </section>
    </Screen>
  );
}

// 안내 없음 · lofi 14. preparing 건물의 QR도 여기로 옵니다(screens.md §3).
function NoGuides({ building }: { building: PublicBuilding }) {
  return (
    <Screen
      topbar={
        <TopBar
          start={<Brand />}
          end={
            <>
              <LargeModeToggle />
              <ShareButton title={building.name} />
            </>
          }
        />
      }
      dock={
        <Dock hint="급한 일은 연락처 없이도 전할 수 있어요">
          <ActionButton
            className="wh-btn wh-btn--secondary"
            size="large"
            variant="neutralWeak"
            disabled
            aria-describedby="pb-empty-report-soon"
          >
            <Icon name="mail" />
            집주인에게 알리기
          </ActionButton>
          <p className="pb-dock-soon">
            <SoonNote id="pb-empty-report-soon">알리기는 다음 업데이트에서 열려요</SoonNote>
          </p>
        </Dock>
      }
    >
      <div className="wh-pad">
        <p className="wh-caption pb-empty-caption">
          {building.name} · {building.displayAddress}
        </p>
        <div className="pb-empty">
          <EmptyState
            hami="folder"
            title="아직 등록된 안내가 없어요"
            description={"집주인이 안내를 등록하면\n여기에서 바로 볼 수 있어요."}
          />
        </div>
      </div>
    </Screen>
  );
}
