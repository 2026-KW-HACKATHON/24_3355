// LF-02 기본 안내 상세 · lofi 11 14 (메모 시트 12·13·44는 다음 업데이트)
import { ActionButton, Skeleton } from "@seed-design/react";
import type { Guide } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { BackButton, Screen, SoonNote, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError, SkeletonLines } from "../../components/ScreenState";
import { CATEGORY } from "../../features/guides/categories";
import { GuideBody } from "../../features/guides/GuideBody";
import { useGuide } from "../../features/guides/queries";
import { toAppError } from "../../lib/errors";
import { useSpeech } from "../../lib/speech";
import "./guide-detail.css";

export function Component() {
  const { buildingId = "", guideId = "" } = useParams();
  const guide = useGuide(guideId);
  const home = `/b/${buildingId}`;

  if (guide.isError) {
    const { code } = toAppError(guide.error);
    if (code === "NOT_FOUND" || code === "VALIDATION_FAILED") return <GuideMissing home={home} />;
    return (
      <DetailShell home={home}>
        <LoadError onRetry={() => void guide.refetch()} retrying={guide.isFetching} />
      </DetailShell>
    );
  }

  if (guide.isPending) {
    return (
      <DetailShell home={home} busy>
        <Delayed label="안내를 불러오는 중">
          <div className="wh-pad gd-skeleton">
            <Skeleton radius="8" height="24px" width="30%" />
            <Skeleton radius="8" height="32px" width="85%" />
            <SkeletonLines lines={4} />
          </div>
        </Delayed>
      </DetailShell>
    );
  }

  // 공개 화면은 공개된 안내만 보여줍니다. 집주인이 받는 초안도 여기서는 없는 안내로 봅니다.
  if (guide.data.status !== "published") return <GuideMissing home={home} />;
  // 다른 건물 주소로 열렸으면 안내가 속한 건물 주소로 바꿉니다.
  if (guide.data.buildingId !== buildingId) {
    return <Navigate replace to={`/b/${guide.data.buildingId}/guides/${guide.data.id}`} />;
  }
  return <GuideDetail guide={guide.data} home={home} />;
}

function DetailShell({
  home,
  busy = false,
  children,
}: {
  home: string;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      topbar={<TopBar start={<BackButton fallback={home} />} title="건물 안내" />}
    >
      {children}
    </Screen>
  );
}

function GuideDetail({ guide, home }: { guide: Guide; home: string }) {
  const speech = useSpeech();
  const label = CATEGORY[guide.category].label;

  function toggleSpeech() {
    if (speech.speaking) speech.stop();
    else speech.speak(`${guide.title}.\n${guide.body}`);
  }

  return (
    <Screen
      topbar={
        <TopBar
          start={<BackButton fallback={home} />}
          title="건물 안내"
          end={
            <button
              type="button"
              className="wh-icon-btn wh-icon-btn--primary"
              aria-label={speech.speaking ? "읽어주기 멈추기" : "읽어주기"}
              aria-pressed={speech.speaking}
              aria-describedby={speech.supported ? undefined : "gd-tts-unsupported"}
              disabled={!speech.supported}
              onClick={toggleSpeech}
            >
              <Icon name="volume-2" />
            </button>
          }
        />
      }
    >
      <div aria-live="polite">
        {speech.speaking ? (
          <div className="gd-tts">
            <span className="gd-tts__wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="gd-tts__text">‘{label}’ 안내를 읽고 있어요</span>
            <button type="button" className="gd-tts__stop" onClick={speech.stop}>
              <span className="gd-tts__stop-face">
                <Icon name="square" />
                멈추기
              </span>
            </button>
          </div>
        ) : null}
      </div>
      {speech.supported ? null : (
        <p className="gd-tts-off" id="gd-tts-unsupported">
          <Icon name="volume-2" />이 브라우저에서는 읽어주기를 쓸 수 없어요
        </p>
      )}

      <article className="wh-pad gd-article">
        <GuideBody guide={guide} caption="updated" />
      </article>

      <div className="wh-pad">
        <div className="gd-memo">
          <div className="gd-memo__text">
            <p className="gd-memo__title">안내가 달라졌나요?</p>
            <p className="gd-memo__sub">집주인이 확인하고 반영할 수 있어요</p>
            <SoonNote id="gd-memo-soon" />
          </div>
          <ActionButton
            className="wh-btn wh-btn--secondary wh-btn--sm"
            size="large"
            variant="neutralWeak"
            disabled
            aria-describedby="gd-memo-soon"
          >
            메모 남기기
          </ActionButton>
        </div>
      </div>
    </Screen>
  );
}

function GuideMissing({ home }: { home: string }) {
  return (
    <DetailShell home={home}>
      <div className="wh-pad gd-missing">
        <EmptyState
          icon="file-text"
          title="이 안내를 찾을 수 없어요"
          description="집주인이 안내를 내렸거나 주소가 바뀌었을 수 있어요."
        >
          <ActionButton
            asChild
            className="wh-btn wh-btn--secondary wh-btn--sm gd-missing__home"
            size="large"
            variant="neutralWeak"
          >
            <Link to={home}>건물 안내 전체 보기</Link>
          </ActionButton>
        </EmptyState>
      </div>
    </DetailShell>
  );
}
