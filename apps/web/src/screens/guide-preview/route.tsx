// LF-14 기본 안내 · 공개 전 확인 · lofi 43 (공개 뒤 첫 공개면 38, 아니면 42)
// 공개한 안내를 고쳤으면 수정본을 보여주고 ‘수정 공개’로 바꿉니다. 함께 반영할 메모(applyMemoIds)를 여기서 고릅니다.
import { ActionButton, Skeleton } from "@seed-design/react";
import type { Guide, ManagedBuildingDetail } from "@wolgyeham/contracts";
import { useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { BackButton, Dock, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError } from "../../components/ScreenState";
import { useToast } from "../../components/useToast";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { applySearch, readApplyIds, stillPending } from "../../features/guides/applyMemos";
import { GuideBody } from "../../features/guides/GuideBody";
import { useBuildingMemos } from "../../features/guides/memos";
import { useGuideRevision, usePublishGuide } from "../../features/guides/queries";
import { errorMessage, toAppError } from "../../lib/errors";
import { formatDay } from "../../lib/format";
import "./guide-preview.css";

type Mode = "first" | "revise";

export function Component() {
  const { buildingId = "", guideId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>
      {(detail) => <PreviewRoute detail={detail} guideId={guideId} />}
    </ManagerGate>
  );
}

function PreviewRoute({ detail, guideId }: { detail: ManagedBuildingDetail; guideId: string }) {
  // 여기서 방금 공개했으면 다음 화면으로 넘어갈 때까지 보던 미리 보기를 그대로 둡니다.
  const [shown, setShown] = useState<{ guide: Guide; mode: Mode }>();
  const guide = detail.guides.find((item) => item.id === guideId);
  if (shown) {
    return (
      <Preview detail={detail} guide={shown.guide} mode={shown.mode} published onPublished={noop} />
    );
  }
  if (!guide) return <PreviewState detail={detail} guide={undefined} />;
  if (guide.status === "draft") {
    return (
      <Preview
        detail={detail}
        guide={guide}
        mode="first"
        published={false}
        onPublished={() => setShown({ guide, mode: "first" })}
      />
    );
  }
  return (
    <RevisePreview
      detail={detail}
      guide={guide}
      onPublished={(previewed) => setShown({ guide: previewed, mode: "revise" })}
    />
  );
}

function noop() {}

/** 공개한 안내의 수정본. 수정일은 공개하는 지금으로 보여줍니다(lofi 25 ‘반영하면’). */
function RevisePreview({
  detail,
  guide,
  onPublished,
}: {
  detail: ManagedBuildingDetail;
  guide: Guide;
  onPublished: (previewed: Guide) => void;
}) {
  const revision = useGuideRevision(guide.id);
  const [now] = useState(() => new Date().toISOString());
  const base = `/manage/${detail.building.id}`;
  if (revision.isError) {
    return (
      <Screen topbar={<TopBar start={<BackButton fallback={base} />} title="공개 전 확인" />}>
        <LoadError onRetry={() => void revision.refetch()} retrying={revision.isFetching} />
      </Screen>
    );
  }
  if (revision.isPending) {
    return (
      <Screen busy topbar={<TopBar start={<BackButton fallback={base} />} title="공개 전 확인" />}>
        <Delayed label="고친 안내를 불러오는 중">
          <div className="wh-pad gp-skeleton">
            <Skeleton radius="16" height="88px" />
            <Skeleton radius="16" height="260px" />
          </div>
        </Delayed>
      </Screen>
    );
  }
  if (!revision.data) return <PreviewState detail={detail} guide={guide} />;
  const previewed: Guide = {
    ...guide,
    category: revision.data.category,
    title: revision.data.title,
    body: revision.data.body,
    updatedAt: now,
  };
  return (
    <Preview
      detail={detail}
      guide={previewed}
      mode="revise"
      published={false}
      onPublished={() => onPublished(previewed)}
    />
  );
}

function Preview({
  detail,
  guide,
  mode,
  published,
  onPublished,
}: {
  detail: ManagedBuildingDetail;
  guide: Guide;
  mode: Mode;
  published: boolean;
  onPublished: () => void;
}) {
  const buildingId = detail.building.id;
  const base = `/manage/${buildingId}`;
  const editPath = `${base}/guides/${guide.id}/edit`;
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const publish = usePublishGuide(buildingId, guide.id);
  const revision = useGuideRevision(guide.id, mode === "revise");
  const pending = useBuildingMemos(buildingId, "pending", mode === "revise");
  const inFlight = useRef(false);
  const [conflict, setConflict] = useState(false);

  const selected = readApplyIds(location.search);
  const guideMemos = (pending.data ?? []).filter((memo) => memo.guideId === guide.id);
  // 다른 곳에서 먼저 반영·유지한 메모는 빼고 보냅니다. 목록을 못 받았으면 고른 그대로(서버가 다시 확인).
  const applyIds = pending.isSuccess
    ? stillPending(
        selected,
        guideMemos.map((memo) => memo.id),
      )
    : selected;
  const waitingMemos = mode === "revise" && selected.length > 0 && pending.isPending;

  function setSelected(next: readonly string[]) {
    void navigate(
      { pathname: location.pathname, search: applySearch(next) },
      { replace: true, preventScrollReset: true },
    );
  }

  function backToEdit() {
    void navigate(`${editPath}${applySearch(selected)}`, { replace: true });
  }

  async function handlePublish() {
    if (inFlight.current) return;
    inFlight.current = true;
    setConflict(false);
    try {
      const result = await publish.mutateAsync(mode === "revise" ? applyIds : []);
      onPublished();
      if (result.buildingOpened) {
        void navigate(`${base}/ready`, { replace: true });
        return;
      }
      if (mode === "revise") {
        const applied = result.appliedMemoIds.length;
        toast(
          applied > 0
            ? `안내를 고쳤어요. 메모 ${applied}개를 반영했어요`
            : "고친 안내를 공개했어요",
        );
      } else {
        toast("안내를 공개했어요");
      }
      void navigate(base, { replace: true });
    } catch (caught) {
      // 오류는 버튼 위 문구로 남깁니다. 공개 내용·수정본·메모 상태는 서버에서 그대로입니다.
      if (toAppError(caught).code === "CONFLICT" && mode === "revise") {
        setConflict(true);
        void revision.refetch();
        void pending.refetch();
      }
    } finally {
      inFlight.current = false;
    }
  }

  const error = publish.error ? toAppError(publish.error) : undefined;
  const message = !error
    ? undefined
    : error.code === "NETWORK" || error.code === "INTERNAL_ERROR"
      ? mode === "revise"
        ? "공개하지 못했어요. 지금 안내와 메모 상태는 그대로예요. 다시 눌러 주세요"
        : "공개하지 못했어요. 다시 눌러 주세요"
      : error.code === "CONFLICT"
        ? mode === "revise" && conflict
          ? "메모 상태가 바뀌었거나 이미 공개했어요. 새로 불러왔으니 확인하고 다시 눌러 주세요"
          : "이미 공개한 안내예요. 관리 홈에서 확인해 주세요"
        : errorMessage(error);

  const busy = publish.isPending || published;
  return (
    <Screen
      topbar={
        <TopBar
          start={
            <button
              type="button"
              className="wh-icon-btn"
              aria-label="돌아가서 수정"
              onClick={backToEdit}
            >
              <Icon name="chevron-left" />
            </button>
          }
          title="공개 전 확인"
          titleAs="h1"
        />
      }
      dock={
        <Dock error={message}>
          <div className="wh-btn-row">
            <ActionButton
              className="wh-btn wh-btn--neutral"
              size="large"
              variant="neutralWeak"
              disabled={busy}
              onClick={backToEdit}
            >
              돌아가서 수정
            </ActionButton>
            <ActionButton
              className="wh-btn wh-grow"
              size="large"
              loading={busy || waitingMemos}
              disabled={busy || waitingMemos}
              onClick={handlePublish}
            >
              {mode === "revise" ? "수정 공개" : "안내 공개하기"}
            </ActionButton>
          </div>
        </Dock>
      }
    >
      <div className="wh-pad">
        <div className="gp-warn" role="note">
          <Icon name="shield-alert" />
          <div>
            <p className="gp-warn__title">이 안내는 QR이나 링크를 가진 누구나 볼 수 있어요</p>
            <p className="gp-warn__text">
              공동현관 비밀번호, 세입자 이름·연락처, 계약 정보는 넣지 마세요. 사진에 보이는 것도
              같아요.
            </p>
          </div>
        </div>

        {mode === "revise" && guideMemos.length > 0 ? (
          <fieldset className="gp-memos">
            <legend className="wh-field-label gp-memos__legend">함께 반영할 메모</legend>
            <p className="wh-caption gp-memos__note">
              고른 메모는 공개와 함께 ‘반영됨’으로 바뀌어요. 고르지 않은 메모는 확인 전으로 남아요.
            </p>
            {guideMemos.map((memo) => (
              <label key={memo.id} className="gp-memo">
                <input
                  type="checkbox"
                  checked={selected.includes(memo.id)}
                  disabled={busy}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, memo.id]
                        : selected.filter((id) => id !== memo.id),
                    )
                  }
                />
                <span className="gp-memo__text">
                  <span className="gp-memo__body">{memo.body}</span>
                  <span className="wh-caption">거주자 메모 · {formatDay(memo.createdAt)}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {mode === "revise" && pending.isError ? (
          <p className="wh-caption gp-memos__note" role="status">
            메모 목록을 불러오지 못했어요. 고른 메모는 그대로 보내요.{" "}
            <button
              type="button"
              className="gp-inline-retry"
              onClick={() => void pending.refetch()}
            >
              다시 시도
            </button>
          </p>
        ) : null}

        <h2 className="wh-field-label gp-label">세입자에게 이렇게 보여요</h2>
        <article className="gp-frame" aria-label="세입자가 보는 안내 미리 보기">
          <GuideBody guide={guide} variant="frame" titleAs="h3" caption="month" />
        </article>
      </div>
    </Screen>
  );
}

function PreviewState({
  detail,
  guide,
}: {
  detail: ManagedBuildingDetail;
  guide: Guide | undefined;
}) {
  const base = `/manage/${detail.building.id}`;
  return (
    <Screen
      topbar={<TopBar start={<BackButton fallback={base} />} title="공개 전 확인" />}
      dock={
        <Dock>
          <div className="wh-btn-row">
            {guide ? (
              <ActionButton
                asChild
                className="wh-btn wh-btn--neutral"
                size="large"
                variant="neutralWeak"
              >
                <Link to={`/b/${guide.buildingId}/guides/${guide.id}`}>세입자 화면 보기</Link>
              </ActionButton>
            ) : null}
            <ActionButton asChild className="wh-btn wh-grow" size="large">
              {guide ? (
                <Link to={`${base}/guides/${guide.id}/edit`} replace>
                  안내 고치기
                </Link>
              ) : (
                <Link to={base}>관리 홈으로</Link>
              )}
            </ActionButton>
          </div>
        </Dock>
      }
    >
      <div className="wh-pad wh-state-top">
        {guide ? (
          <EmptyState
            icon="circle-check"
            title="공개할 수정 내용이 없어요"
            description="지금 공개된 안내가 현관 QR과 링크로 보이고 있어요. 고치려면 ‘안내 고치기’를 눌러 주세요."
          />
        ) : (
          <EmptyState
            icon="file-text"
            title="이 안내를 찾을 수 없어요"
            description="이미 지웠거나 다른 건물의 안내일 수 있어요."
          />
        )}
      </div>
    </Screen>
  );
}
