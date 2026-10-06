// LF-03 공지 상세 · lofi 15 (기간이 끝나면 “종료된 공지예요” + 기본 안내로). 알림을 누르면 여기로 옵니다.
import { ActionButton, Skeleton } from "@seed-design/react";
import type { Notice } from "@wolgyeham/contracts";
import { type ReactNode, useEffect, useRef } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { BackButton, Dock, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError, SkeletonLines } from "../../components/ScreenState";
import { useMe } from "../../features/auth/queries";
import { usePublicBuilding } from "../../features/buildings/queries";
import { recordNoticeOpened, useNotice } from "../../features/notices/queries";
import { toAppError } from "../../lib/errors";
import { formatDay, formatPeriod, noticeTiming } from "../../lib/format";
import { useSpeech } from "../../lib/speech";
import "./notice-detail.css";

export function Component() {
  const { buildingId = "", noticeId = "" } = useParams();
  const notice = useNotice(noticeId);
  const home = `/b/${buildingId}`;

  if (notice.isError) {
    const { code } = toAppError(notice.error);
    if (code === "NOTICE_ENDED") return <NoticeEnded home={home} />;
    if (code === "NOT_FOUND" || code === "VALIDATION_FAILED") return <NoticeMissing home={home} />;
    return (
      <DetailShell home={home}>
        <LoadError onRetry={() => void notice.refetch()} retrying={notice.isFetching} />
      </DetailShell>
    );
  }
  if (notice.isPending) {
    return (
      <DetailShell home={home} busy>
        <Delayed label="공지를 불러오는 중">
          <div className="wh-pad nd-skeleton">
            <Skeleton radius="8" height="24px" width="35%" />
            <Skeleton radius="8" height="32px" width="85%" />
            <Skeleton radius="16" height="72px" />
            <SkeletonLines lines={3} />
          </div>
        </Delayed>
      </DetailShell>
    );
  }
  // 다른 건물 주소로 열렸으면 공지가 속한 건물 주소로 바꿉니다.
  if (notice.data.buildingId !== buildingId) {
    return <Navigate replace to={`/b/${notice.data.buildingId}/notices/${notice.data.id}`} />;
  }
  return <NoticeDetail notice={notice.data} home={home} />;
}

function DetailShell({
  home,
  busy = false,
  end,
  dock,
  children,
}: {
  home: string;
  busy?: boolean;
  end?: ReactNode;
  dock?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      dock={dock}
      topbar={<TopBar start={<BackButton fallback={home} />} title="공지" end={end} />}
    >
      {children}
    </Screen>
  );
}

function BackHomeDock({ home, label }: { home: string; label: string }) {
  return (
    <Dock>
      <ActionButton asChild className="wh-btn wh-btn--neutral" size="large" variant="neutralWeak">
        <Link to={home}>{label}</Link>
      </ActionButton>
    </Dock>
  );
}

function NoticeDetail({ notice, home }: { notice: Notice; home: string }) {
  const speech = useSpeech();
  const building = usePublicBuilding(notice.buildingId);
  const target = building.data ? `${building.data.name} 전 세대` : "이 건물 전 세대";
  const period = formatPeriod(notice.startsAt, notice.endsAt);
  const me = useMe();
  const resident = me.data?.occupancy?.buildingId === notice.buildingId;
  const recorded = useRef<string | undefined>(undefined);

  // 이 건물 거주자가 열면 열람을 한 번 기록합니다(알림 대상이 아니었으면 서버가 무시).
  useEffect(() => {
    if (!resident || recorded.current === notice.id) return;
    recorded.current = notice.id;
    void recordNoticeOpened(notice.id).catch(() => undefined);
  }, [resident, notice.id]);

  function toggleSpeech() {
    if (speech.speaking) speech.stop();
    else speech.speak(`${notice.title}.\n적용 기간, ${period}.\n${notice.body}`);
  }

  return (
    <DetailShell
      home={home}
      dock={<BackHomeDock home={home} label="건물로 돌아가기" />}
      end={
        <button
          type="button"
          className="wh-icon-btn wh-icon-btn--primary"
          aria-label={speech.speaking ? "읽어주기 멈추기" : "읽어주기"}
          aria-pressed={speech.speaking}
          aria-describedby={speech.supported ? undefined : "nd-tts-unsupported"}
          disabled={!speech.supported}
          onClick={toggleSpeech}
        >
          <Icon name="volume-2" />
        </button>
      }
    >
      <div aria-live="polite">
        {speech.speaking ? (
          <div className="nd-tts">
            <span className="nd-tts__text">공지를 읽고 있어요</span>
            <button type="button" className="nd-tts__stop" onClick={speech.stop}>
              <Icon name="square" />
              멈추기
            </button>
          </div>
        ) : null}
      </div>
      {speech.supported ? null : (
        <p className="wh-caption nd-tts-off" id="nd-tts-unsupported">
          이 브라우저에서는 읽어주기를 쓸 수 없어요
        </p>
      )}

      <article className="wh-pad nd-article">
        <div className="nd-badges">
          <span className="wh-badge wh-badge--moon">
            <Icon name="megaphone" />
            공지
          </span>
          <span className="wh-badge wh-badge--gray">
            {noticeTiming(notice.startsAt, notice.endsAt, Date.now())}
          </span>
        </div>
        <h1 className="wh-h-title nd-title" tabIndex={-1}>
          {notice.title}
        </h1>
        <p className="wh-caption nd-meta">집주인 · {formatDay(notice.publishedAt)} 게시</p>

        <dl className="nd-period">
          <div className="nd-period__row">
            <dt>적용 기간</dt>
            <dd>{period}</dd>
          </div>
          <div className="nd-period__row">
            <dt>대상</dt>
            <dd>{target}</dd>
          </div>
        </dl>

        <p className="nd-body">{notice.body}</p>

        <p className="wh-note nd-note">
          <Icon name="info" />
          <span>
            공지는 기간이 지나면 건물 화면에서 내려가요. 계속 필요한 규칙은 건물 안내에 있어요.
          </span>
        </p>
      </article>
    </DetailShell>
  );
}

function NoticeEnded({ home }: { home: string }) {
  return (
    <DetailShell home={home} dock={<BackHomeDock home={home} label="건물 안내 보기" />}>
      <div className="wh-pad wh-state-top">
        <EmptyState
          icon="clock"
          title="종료된 공지예요"
          description={
            "공지는 기간이 지나면 내려가요.\n계속 필요한 규칙은 건물 안내에서 볼 수 있어요."
          }
        />
      </div>
    </DetailShell>
  );
}

function NoticeMissing({ home }: { home: string }) {
  return (
    <DetailShell home={home} dock={<BackHomeDock home={home} label="건물 안내 보기" />}>
      <div className="wh-pad wh-state-top">
        <EmptyState
          icon="file-text"
          title="이 공지를 찾을 수 없어요"
          description="주소가 잘못 열렸거나 공지가 내려갔을 수 있어요."
        />
      </div>
    </DetailShell>
  );
}
