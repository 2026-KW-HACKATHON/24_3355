// LF-15 공지 올린 뒤 · lofi 37 (알림 + 같은 링크). 관리 홈의 진행 중 공지에서도 이 화면으로 옵니다.
import { ActionButton, Skeleton } from "@seed-design/react";
import type { ManagedBuildingDetail, Notice } from "@wolgyeham/contracts";
import { type ReactNode, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { BackButton, Dock, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError } from "../../components/ScreenState";
import { LandlordTabs } from "../../components/TabBar";
import { useToast } from "../../components/useToast";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { useNotice } from "../../features/notices/queries";
import { usePushPublicKey } from "../../features/push/queries";
import { toAppError } from "../../lib/errors";
import { formatDay, formatPeriod } from "../../lib/format";
import { copyText, publicOrigin, shareOrCopy } from "../../lib/share";
import "./notice-posted.css";

export function Component() {
  const { buildingId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>
      {(detail) => <NoticePosted detail={detail} />}
    </ManagerGate>
  );
}

/** 올린 직후에만 오는 발송 시도 수. 새로고침해도 history state에 남고, 다른 경로로 오면 없습니다. */
function readAttempted(state: unknown): number | undefined {
  if (typeof state !== "object" || state === null || !("attemptedCount" in state)) return undefined;
  const value = (state as { attemptedCount: unknown }).attemptedCount;
  return typeof value === "number" ? value : undefined;
}

function PostedShell({
  buildingId,
  dock,
  children,
}: {
  buildingId: string;
  dock?: ReactNode;
  children: ReactNode;
}) {
  const home = `/manage/${buildingId}`;
  return (
    <Screen
      dock={dock}
      tabs={<LandlordTabs buildingId={buildingId} active="manage" />}
      topbar={
        <TopBar
          start={<span aria-hidden="true" className="np-spacer" />}
          title="공지"
          end={<BackButton fallback={home} icon="x" label="닫기" />}
        />
      }
    >
      {children}
    </Screen>
  );
}

function NoticePosted({ detail }: { detail: ManagedBuildingDetail }) {
  const { noticeId = "" } = useParams();
  const location = useLocation();
  const buildingId = detail.building.id;
  const notice = useNotice(noticeId);
  const attempted = readAttempted(location.state);
  const homeDock = (
    <Dock>
      <ActionButton asChild className="wh-btn wh-btn--neutral" size="large" variant="neutralWeak">
        <Link to={`/manage/${buildingId}`} replace>
          관리 홈으로
        </Link>
      </ActionButton>
    </Dock>
  );

  if (notice.isError) {
    const { code } = toAppError(notice.error);
    if (code === "NOTICE_ENDED" || code === "NOT_FOUND" || code === "VALIDATION_FAILED") {
      return (
        <PostedShell buildingId={buildingId} dock={homeDock}>
          <div className="wh-pad wh-state-top">
            <EmptyState
              icon="clock"
              title={code === "NOTICE_ENDED" ? "종료된 공지예요" : "이 공지를 찾을 수 없어요"}
              description="기간이 지난 공지는 건물 화면에서 내려가요."
            />
          </div>
        </PostedShell>
      );
    }
    return (
      <PostedShell buildingId={buildingId}>
        <LoadError onRetry={() => void notice.refetch()} retrying={notice.isFetching} />
      </PostedShell>
    );
  }
  if (notice.isPending) {
    return (
      <PostedShell buildingId={buildingId}>
        <Delayed label="공지를 불러오는 중">
          <div className="wh-pad np-skeleton">
            <Skeleton radius="8" height="32px" width="60%" />
            <Skeleton radius="16" height="72px" />
            <Skeleton radius="16" height="120px" />
          </div>
        </Delayed>
      </PostedShell>
    );
  }
  // 다른 건물의 공지면 보여주지 않습니다(관리 권한은 건물마다).
  if (notice.data.buildingId !== buildingId) {
    return (
      <PostedShell buildingId={buildingId} dock={homeDock}>
        <div className="wh-pad wh-state-top">
          <EmptyState icon="file-text" title="이 건물의 공지가 아니에요" />
        </div>
      </PostedShell>
    );
  }
  return (
    <PostedShell buildingId={buildingId} dock={homeDock}>
      <PostedBody notice={notice.data} attempted={attempted} buildingName={detail.building.name} />
    </PostedShell>
  );
}

function PostedBody({
  notice,
  attempted,
  buildingName,
}: {
  notice: Notice;
  attempted: number | undefined;
  buildingName: string;
}) {
  const toast = useToast();
  const [shareError, setShareError] = useState<string>();
  const publicKey = usePushPublicKey();
  const url = `${publicOrigin()}/b/${notice.buildingId}/notices/${notice.id}`;
  const justPosted = attempted !== undefined;

  async function copy() {
    setShareError(undefined);
    if (await copyText(url)) toast("공지 링크를 복사했어요");
    else setShareError(`복사하지 못했어요. 이 주소를 길게 눌러 복사해 주세요: ${url}`);
  }

  async function share() {
    setShareError(undefined);
    const outcome = await shareOrCopy({
      title: `${buildingName} 공지`,
      text: `[${buildingName}] ${notice.title}`,
      url,
    });
    if (outcome === "copied") toast("공유 창이 없어 링크를 복사했어요. 카카오톡에 붙여넣어 주세요");
    if (outcome === "failed") setShareError(`공유하지 못했어요. 이 주소를 전해 주세요: ${url}`);
  }

  return (
    <div className="wh-pad np-body">
      <div className="np-done">
        {justPosted ? (
          <span className="np-done__ok">
            <Icon name="check" strokeWidth={3} />
          </span>
        ) : null}
        <h1 className="wh-h-title" tabIndex={-1}>
          {justPosted ? "공지를 올렸어요" : "진행 중인 공지"}
        </h1>
      </div>
      <div className="np-sum">
        <p className="np-sum__title">{notice.title}</p>
        <p className="np-sum__sub">현관 QR 화면에 {formatDay(notice.endsAt)}까지 보여요</p>
        <p className="np-sum__period">{formatPeriod(notice.startsAt, notice.endsAt)}</p>
      </div>

      {justPosted ? (
        <div className="np-row">
          <span className="np-row__ic np-row__ic--navy">
            <Icon name="bell" />
          </span>
          <div className="np-row__text">
            {publicKey.data === null ? (
              <>
                <p className="np-row__title">이번에는 알림을 보내지 않았어요</p>
                <p className="np-row__sub">
                  지금은 알림을 보낼 수 없는 환경이에요. 아래 링크로 같은 공지를 전해 주세요.
                </p>
              </>
            ) : attempted === 0 ? (
              // 알림을 켠 거주자가 없으면 ‘0명에게 시도’ 대신 링크로 전하라고 알립니다(QA 2차).
              <>
                <p className="np-row__title">아직 알림을 켠 거주자가 없어요</p>
                <p className="np-row__sub">
                  이번에는 알림이 가지 않았어요. 아래 링크로 같은 공지를 전해 주세요.
                </p>
              </>
            ) : (
              <>
                <p className="np-row__title">알림 대상 {attempted}명에게 발송을 시도했어요</p>
                <p className="np-row__sub">
                  알림을 켠 연결 거주자 기준이에요. 도착과 열람은 기기마다 달라요.
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className="np-row np-row--last">
        <span className="np-row__ic">
          <Icon name="link" />
        </span>
        <div className="np-row__text">
          <p className="np-row__title">알림을 받지 않는 분에게도 같은 링크로</p>
          <p className="np-row__sub">
            누가 연결했는지는 보여주지 않아요. 평소 연락하던 카톡으로 링크만 보내면 모두 같은 공지를
            봐요.
          </p>
          <div className="np-share">
            <ActionButton
              className="wh-btn wh-btn--secondary np-share__btn"
              size="large"
              variant="neutralWeak"
              onClick={() => void copy()}
            >
              <Icon name="copy" />
              공지 링크 복사
            </ActionButton>
            <ActionButton
              className="wh-btn wh-btn--neutral np-share__btn"
              size="large"
              variant="neutralWeak"
              onClick={() => void share()}
            >
              <Icon name="message-circle" />
              카카오톡 공유
            </ActionButton>
          </div>
          {shareError ? (
            <p className="wh-field-error np-share-error" role="alert">
              {shareError}
            </p>
          ) : null}
        </div>
      </div>

      {/* 공개한 안내 고치기(33 수정 → 43 수정 공개)가 열려 관리 홈의 기본 안내 목록으로 잇습니다(lofi 37). */}
      <p className="np-also">
        <Icon name="pencil-line" />
        <span>
          계속 바뀌는 규칙이라면{" "}
          <Link
            className="wh-text-action np-also__link"
            to={`/manage/${notice.buildingId}#lh-guides`}
          >
            기본 안내도 고치기
          </Link>
        </span>
      </p>
    </div>
  );
}
