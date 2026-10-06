// 처음 오셨나요 · 안내를 한 장씩 · lofi 36 46 (마지막 장에서 연결 제안, 이미 연결한 사람은 ‘거주자 홈으로’)
import { ActionButton, Skeleton } from "@seed-design/react";
import type { Guide, PublicBuilding } from "@wolgyeham/contracts";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import { Dock, Screen, TopBar, useGoBack } from "../../components/Screen";
import { Delayed, EmptyState, LoadError } from "../../components/ScreenState";
import { useMe } from "../../features/auth/queries";
import { BuildingNotFound } from "../../features/buildings/BuildingNotFound";
import { usePublicBuilding, usePublicGuides } from "../../features/buildings/queries";
import { GuideBody } from "../../features/guides/GuideBody";
import { connectPath } from "../../features/occupancy/connectDraft";
import { toAppError } from "../../lib/errors";
import "./first-guide.css";

export function Component() {
  const { buildingId = "" } = useParams();
  const building = usePublicBuilding(buildingId);
  const guides = usePublicGuides(buildingId);
  const home = `/b/${buildingId}`;

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
      <FirstShell home={home}>
        <LoadError
          headingLevel={2}
          retrying={building.isFetching || guides.isFetching}
          onRetry={() => {
            if (building.isError) void building.refetch();
            if (guides.isError) void guides.refetch();
          }}
        />
      </FirstShell>
    );
  }
  if (!building.isSuccess || !guides.isSuccess) {
    return (
      <FirstShell home={home} busy>
        <Delayed label="안내를 불러오는 중">
          <div className="fg-skeleton">
            <Skeleton radius="16" height="56px" width="70%" />
            <Skeleton radius="16" height="360px" />
          </div>
        </Delayed>
      </FirstShell>
    );
  }
  if (guides.data.length === 0) {
    return (
      <FirstShell home={home}>
        <div className="wh-pad fg-empty">
          <EmptyState
            hami="folder"
            headingLevel={2}
            title="아직 등록된 안내가 없어요"
            description={"집주인이 안내를 등록하면\n여기에서 바로 볼 수 있어요."}
          />
        </div>
      </FirstShell>
    );
  }
  return <FirstGuideCards building={building.data} guides={guides.data} home={home} />;
}

function FirstShell({
  home,
  busy = false,
  dock,
  children,
}: {
  home: string;
  busy?: boolean;
  dock?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Screen
      tone="gray"
      busy={busy}
      dock={dock}
      topbar={
        <TopBar
          start={<span aria-hidden="true" className="fg-spacer" />}
          title="처음 오셨나요?"
          titleAs="h1"
          end={
            <Link className="wh-topbar__text-btn fg-skip" to={home} replace>
              건너뛰기
            </Link>
          }
        />
      }
    >
      {children}
    </Screen>
  );
}

function FirstGuideCards({
  building,
  guides,
  home,
}: {
  building: PublicBuilding;
  guides: Guide[];
  home: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const total = guides.length;
  const isLast = index === total - 1;
  const goBack = useGoBack(home);
  const me = useMe();
  const resident = me.data?.occupancy?.buildingId === building.id;

  // 손으로 넘겨도(scroll-snap) 지금 장을 따라갑니다.
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = Math.round(element.scrollLeft / Math.max(1, element.clientWidth));
        setIndex(Math.min(total - 1, Math.max(0, next)));
      });
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [total]);

  function go(next: number) {
    const element = track.current;
    const target = Math.min(total - 1, Math.max(0, next));
    setIndex(target);
    if (!element) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ left: target * element.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }

  const bubble =
    isLast && total > 1 ? "마지막 안내예요." : `${building.name}에서 먼저 알아두면 좋은 안내예요.`;

  return (
    <FirstShell
      home={home}
      dock={
        isLast && resident ? (
          <Dock>
            <ActionButton asChild className="wh-btn" size="large">
              <Link to={home}>거주자 홈으로</Link>
            </ActionButton>
          </Dock>
        ) : isLast ? (
          <Dock>
            <div className="wh-btn-row">
              <ActionButton
                className="wh-btn wh-btn--neutral"
                size="large"
                variant="neutralWeak"
                onClick={goBack}
              >
                지금은 안내만 보기
              </ActionButton>
              <ActionButton asChild className="wh-btn wh-grow" size="large">
                <Link to={connectPath(building.id)}>연결하기</Link>
              </ActionButton>
            </div>
          </Dock>
        ) : (
          <Dock>
            <div className="wh-btn-row">
              <ActionButton
                asChild
                className="wh-btn wh-btn--neutral"
                size="large"
                variant="neutralWeak"
              >
                <Link to={home}>전체 안내 보기</Link>
              </ActionButton>
              <ActionButton className="wh-btn wh-grow" size="large" onClick={() => go(index + 1)}>
                다음 안내
              </ActionButton>
            </div>
          </Dock>
        )
      }
    >
      <div className="fg-hello">
        <Hami pose="guide" size={72} eager />
        <p className="wh-bubble wh-bubble--tail-left">{bubble}</p>
      </div>

      <div className="fg-pager">
        <button
          type="button"
          className="wh-icon-btn"
          aria-label="이전 안내"
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          <Icon name="chevron-left" />
        </button>
        <div className="fg-dots" aria-hidden="true">
          {guides.map((guide, i) => (
            <span key={guide.id} className={i === index ? "fg-dot fg-dot--on" : "fg-dot"} />
          ))}
        </div>
        <p className="wh-visually-hidden" aria-live="polite">
          {total}장 중 {index + 1}번째
        </p>
        <button
          type="button"
          className="wh-icon-btn"
          aria-label="다음 안내"
          disabled={isLast}
          onClick={() => go(index + 1)}
        >
          <Icon name="chevron-right" />
        </button>
      </div>

      <section
        className="fg-track"
        ref={track}
        aria-roledescription="carousel"
        aria-label="이 건물 안내"
      >
        {guides.map((guide, i) => (
          <section
            key={guide.id}
            className="fg-slide"
            aria-roledescription="slide"
            aria-label={`${total}장 중 ${i + 1}번째`}
            inert={i !== index}
          >
            <article className="fg-card" aria-labelledby={`fg-title-${guide.id}`}>
              <GuideBody
                guide={guide}
                variant="card"
                titleAs="h2"
                titleId={`fg-title-${guide.id}`}
                badgeSuffix={`${i + 1} / ${total}`}
                photoLimit={1}
                clamp
              />
              <Link className="fg-more" to={`/b/${building.id}/guides/${guide.id}`}>
                이 안내 끝까지 보기
              </Link>
            </article>
            {i === total - 1 && !resident ? (
              <div className="fg-next">
                <h2 className="fg-next__title">다음 공지도 받아보려면</h2>
                <p className="fg-next__text">
                  이 건물에 살고 있다면 가입코드로 연결해요. 연결하지 않아도 안내는 언제든 볼 수
                  있어요.
                </p>
              </div>
            ) : null}
          </section>
        ))}
      </section>
    </FirstShell>
  );
}
