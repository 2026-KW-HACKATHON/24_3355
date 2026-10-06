// LF-17 수정 메모 검토 · lofi 25. 반영 → 33 안내 고치기(이 메모를 반영할 메모로) → 43 ‘수정 공개’.
// 유지 → 사유 시트(필수). 다른 곳에서 먼저 처리했으면(409) 결과를 다시 불러와 보여줍니다.
import { ActionButton, Skeleton } from "@seed-design/react";
import type { Guide, ManagedBuildingDetail, ManagedCorrectionMemo } from "@wolgyeham/contracts";
import { type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { LEAVE_OK } from "../../components/leaveOk";
import { BackButton, Dock, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError, SkeletonLines } from "../../components/ScreenState";
import { useToast } from "../../components/useToast";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { applySearch } from "../../features/guides/applyMemos";
import { CATEGORY } from "../../features/guides/categories";
import {
  MEMO_STATUS,
  memoOutcome,
  useBuildingMemos,
  useCorrectionMemo,
} from "../../features/guides/memos";
import { toAppError } from "../../lib/errors";
import { formatDay, formatMonth } from "../../lib/format";
import { KeepSheet } from "./KeepSheet";
import "./memo-review.css";

export function Component() {
  const { buildingId = "", memoId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>
      {(detail) => <MemoReviewRoute detail={detail} memoId={memoId} />}
    </ManagerGate>
  );
}

function ReviewShell({
  base,
  busy = false,
  dock,
  children,
}: {
  base: string;
  busy?: boolean;
  dock?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      dock={dock}
      topbar={<TopBar start={<BackButton fallback={base} />} title="안내 수정 메모" />}
    >
      {children}
    </Screen>
  );
}

function MemoReviewRoute({ detail, memoId }: { detail: ManagedBuildingDetail; memoId: string }) {
  const base = `/manage/${detail.building.id}`;
  const memo = useCorrectionMemo(memoId);

  if (memo.isError) {
    const { code } = toAppError(memo.error);
    if (
      code === "NOT_FOUND" ||
      code === "VALIDATION_FAILED" ||
      code === "NOT_BUILDING_MANAGER" ||
      code === "FORBIDDEN"
    ) {
      return <MemoMissing base={base} />;
    }
    return (
      <ReviewShell base={base}>
        <LoadError onRetry={() => void memo.refetch()} retrying={memo.isFetching} />
      </ReviewShell>
    );
  }
  if (memo.isPending) {
    return (
      <ReviewShell base={base} busy>
        <Delayed label="메모를 불러오는 중">
          <div className="wh-pad mr-skeleton">
            <Skeleton radius="8" height="24px" width="35%" />
            <Skeleton radius="8" height="32px" width="80%" />
            <Skeleton radius="16" height="96px" />
            <Skeleton radius="16" height="72px" />
            <SkeletonLines lines={3} />
          </div>
        </Delayed>
      </ReviewShell>
    );
  }
  const guide = detail.guides.find((item) => item.id === memo.data.guideId);
  if (!guide) return <MemoMissing base={base} />;
  return (
    <MemoReview
      base={base}
      guide={guide}
      memo={memo.data}
      refetching={memo.isFetching}
      onRefresh={() => void memo.refetch()}
    />
  );
}

function MemoReview({
  base,
  guide,
  memo,
  refetching,
  onRefresh,
}: {
  base: string;
  guide: Guide;
  memo: ManagedCorrectionMemo;
  refetching: boolean;
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const category = CATEGORY[guide.category];
  const pendingList = useBuildingMemos(guide.buildingId, "pending");
  const [keepOpen, setKeepOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const pending = memo.status === "pending";
  const others = (pendingList.data ?? []).filter(
    (item) => item.guideId === guide.id && item.id !== memo.id,
  ).length;

  return (
    <ReviewShell
      base={base}
      dock={
        pending ? (
          <Dock>
            <div className="wh-btn-row">
              <ActionButton
                className="wh-btn wh-btn--neutral"
                size="large"
                variant="neutralWeak"
                onClick={() => setKeepOpen(true)}
              >
                기존 안내 유지
              </ActionButton>
              <ActionButton asChild className="wh-btn wh-grow" size="large">
                <Link to={`${base}/guides/${guide.id}/edit${applySearch([memo.id])}`}>
                  안내에 반영
                </Link>
              </ActionButton>
            </div>
          </Dock>
        ) : (
          <Dock>
            <ActionButton asChild className="wh-btn" size="large">
              <Link to={base}>관리 홈으로</Link>
            </ActionButton>
          </Dock>
        )
      }
    >
      <div className="wh-pad mr-body">
        <span className="wh-badge wh-badge--navy">
          <Icon name={category.icon} />
          {category.label} 안내
        </span>
        <h1 className="wh-h-title mr-title" tabIndex={-1}>
          ‘{category.label}’ 안내가 달라졌다는 메모예요
        </h1>

        <div className="mr-cmp mr-cmp--now">
          <p className="mr-cmp__head">
            <span>지금 안내 · {formatMonth(guide.updatedAt)}</span>
          </p>
          <p className="mr-cmp__title">{guide.title}</p>
          <p className="mr-cmp__text">{guide.body}</p>
        </div>
        <div className="mr-arrow" aria-hidden="true">
          <span>
            <Icon name="arrow-down" />
          </span>
        </div>
        <div className="mr-cmp mr-cmp--memo">
          <p className="mr-cmp__head">
            <span>거주자 메모 · {formatDay(memo.createdAt)}</span>
            <span>작성자 비공개</span>
          </p>
          <p className="mr-cmp__text mr-cmp__text--memo">{memo.body}</p>
        </div>

        {pending ? (
          <div className="mr-result">
            <h2 className="wh-field-label">반영하면</h2>
            <ul>
              <li className="mr-fx">
                <Icon name="calendar-check" />
                안내 수정일이 {formatMonth(new Date().toISOString())}로 바뀌어요
              </li>
              <li className="mr-fx">
                <Icon name="check-check" />
                {others > 0
                  ? `이 메모가 ‘반영됨’으로 바뀌어요. 같은 안내의 메모 ${others}개도 함께 반영할지 고를 수 있어요`
                  : "이 메모가 ‘반영됨’으로 바뀌어요"}
              </li>
              <li className="mr-fx">
                <Icon name="eye" />
                다음 입주자는 바뀐 안내를 바로 읽어요
              </li>
            </ul>
            <p className="wh-note mr-note">
              <Icon name="info" />
              <span>
                안내를 고친 뒤 ‘수정 공개’를 눌러야 바뀌어요. 그전까지 세입자에게는 지금 안내가
                그대로 보여요.
              </span>
            </p>
          </div>
        ) : (
          <div className="mr-done" role="status">
            <p className="mr-done__head">
              <span className={`wh-badge wh-badge--${MEMO_STATUS[memo.status].badge}`}>
                {MEMO_STATUS[memo.status].label}
              </span>
              {conflict ? <span className="wh-caption">다른 곳에서 먼저 처리했어요</span> : null}
            </p>
            <p className="mr-done__text">{memoOutcome(memo)}</p>
            {memo.status === "kept" && memo.keptReason ? (
              <p className="mr-done__reason">사유: {memo.keptReason}</p>
            ) : null}
          </div>
        )}
        {refetching && conflict ? <p className="wh-caption">새로 불러오는 중이에요</p> : null}
      </div>

      <KeepSheet
        open={keepOpen}
        onOpenChange={setKeepOpen}
        memoId={memo.id}
        onKept={() => {
          toast("기존 안내를 유지했어요");
          void navigate(base, { replace: true, state: LEAVE_OK });
        }}
        onConflict={() => {
          setKeepOpen(false);
          setConflict(true);
          onRefresh();
        }}
      />
    </ReviewShell>
  );
}

function MemoMissing({ base }: { base: string }) {
  return (
    <ReviewShell
      base={base}
      dock={
        <Dock>
          <ActionButton asChild className="wh-btn" size="large">
            <Link to={base}>관리 홈으로</Link>
          </ActionButton>
        </Dock>
      }
    >
      <div className="wh-pad wh-state-top">
        <EmptyState
          icon="file-text"
          title="이 메모를 찾을 수 없어요"
          description="안내가 내려갔거나 다른 건물의 메모일 수 있어요."
        />
      </div>
    </ReviewShell>
  );
}
