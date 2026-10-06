// LF-14 기본 안내 · 공개 전 확인 · lofi 43 (공개 뒤 첫 공개면 38, 아니면 42)
import { ActionButton } from "@seed-design/react";
import type { Guide, ManagedBuildingDetail } from "@wolgyeham/contracts";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { BackButton, Dock, Screen, TopBar } from "../../components/Screen";
import { EmptyState } from "../../components/ScreenState";
import { useToast } from "../../components/useToast";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { GuideBody } from "../../features/guides/GuideBody";
import { usePublishGuide } from "../../features/guides/queries";
import { errorMessage, toAppError } from "../../lib/errors";
import "./guide-preview.css";

export function Component() {
  const { buildingId = "", guideId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>
      {(detail) => <PreviewRoute detail={detail} guideId={guideId} />}
    </ManagerGate>
  );
}

function PreviewRoute({ detail, guideId }: { detail: ManagedBuildingDetail; guideId: string }) {
  // 여기서 방금 공개했으면 다음 화면으로 넘어갈 때까지 미리 보기를 그대로 둡니다.
  const [publishedHere, setPublishedHere] = useState(false);
  const guide = detail.guides.find((item) => item.id === guideId);
  if (!guide || (guide.status === "published" && !publishedHere)) {
    return <PreviewState detail={detail} guide={guide} />;
  }
  return (
    <Preview
      detail={detail}
      guide={guide}
      published={publishedHere}
      onPublished={() => setPublishedHere(true)}
    />
  );
}

function Preview({
  detail,
  guide,
  published,
  onPublished,
}: {
  detail: ManagedBuildingDetail;
  guide: Guide;
  published: boolean;
  onPublished: () => void;
}) {
  const base = `/manage/${detail.building.id}`;
  const editPath = `${base}/guides/${guide.id}/edit`;
  const navigate = useNavigate();
  const toast = useToast();
  const publish = usePublishGuide(detail.building.id, guide.id);
  const inFlight = useRef(false);

  function backToEdit() {
    void navigate(editPath, { replace: true });
  }

  async function handlePublish() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await publish.mutateAsync();
      onPublished();
      if (result.buildingOpened) {
        void navigate(`${base}/ready`, { replace: true });
      } else {
        toast("안내를 공개했어요");
        void navigate(base, { replace: true });
      }
    } catch {
      // 오류는 버튼 위 문구로 남깁니다.
    } finally {
      inFlight.current = false;
    }
  }

  const error = publish.error ? toAppError(publish.error) : undefined;
  const message = !error
    ? undefined
    : error.code === "NETWORK" || error.code === "INTERNAL_ERROR"
      ? "공개하지 못했어요. 다시 눌러 주세요"
      : error.code === "CONFLICT"
        ? "이미 공개한 안내예요. 관리 홈에서 확인해 주세요"
        : errorMessage(error);

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
              disabled={publish.isPending || published}
              onClick={backToEdit}
            >
              돌아가서 수정
            </ActionButton>
            <ActionButton
              className="wh-btn wh-grow"
              size="large"
              loading={publish.isPending || published}
              disabled={publish.isPending || published}
              onClick={handlePublish}
            >
              안내 공개하기
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
              <Link to={base}>관리 홈으로</Link>
            </ActionButton>
          </div>
        </Dock>
      }
    >
      <div className="wh-pad wh-state-top">
        {guide ? (
          <EmptyState
            icon="circle-check"
            title="이미 공개한 안내예요"
            description="현관 QR과 링크로 지금 볼 수 있어요."
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
