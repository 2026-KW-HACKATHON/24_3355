// LF-18 입주 카드 · lofi 39 (QR 칸과 가입코드 칸을 나눈 카드. 인쇄·카카오톡 보내기)
import { ActionButton, Skeleton } from "@seed-design/react";
import type { ManagedBuildingDetail } from "@wolgyeham/contracts";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { CodeCells } from "../../components/CodeCells";
import { Icon } from "../../components/Icon";
import { QrCode } from "../../components/QrCode";
import { BackButton, Dock, Screen, TopBar } from "../../components/Screen";
import { EmptyState, LoadError } from "../../components/ScreenState";
import { useToast } from "../../components/useToast";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { useJoinCode } from "../../features/buildings/queries";
import { CATEGORY, CATEGORY_ORDER } from "../../features/guides/categories";
import { publicBuildingQrUrl, publicBuildingUrl, publicOrigin, shareOrCopy } from "../../lib/share";
import "./move-in-card.css";

export function Component() {
  const { buildingId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>{(detail) => <MoveInCard detail={detail} />}</ManagerGate>
  );
}

/** “분리수거·택배·설비·공지” — 공개한 안내 종류에서 만듭니다(연락은 뺌). */
function coveredTopics(detail: ManagedBuildingDetail): string {
  const used = new Set(
    detail.guides.filter((guide) => guide.status === "published").map((guide) => guide.category),
  );
  const labels = CATEGORY_ORDER.filter(
    (category) => category !== "contact" && used.has(category),
  ).map((category) => CATEGORY[category].label.replace("보일러·", ""));
  return [...labels, "공지"].join("·");
}

function MoveInCard({ detail }: { detail: ManagedBuildingDetail }) {
  const { building } = detail;
  const base = `/manage/${building.id}`;
  const origin = publicOrigin();
  // 카카오톡으로 보내는 링크는 주소 그대로, 인쇄하는 QR에는 `?via=qr`을 담습니다.
  const publicUrl = publicBuildingUrl(building.id, origin);
  const qrUrl = publicBuildingQrUrl(building.id, origin);
  const host = new URL(origin).host;
  const joinCode = useJoinCode(building.id);
  const toast = useToast();
  const [shareError, setShareError] = useState<string>();
  const code = joinCode.data?.code;

  async function send() {
    if (!code) return;
    setShareError(undefined);
    const outcome = await shareOrCopy({
      title: `${building.name} 생활 안내`,
      text: `${building.name} 생활 안내예요.\n안내는 아래 주소에서 가입하지 않아도 볼 수 있어요.\n새 공지까지 받으려면 건물 화면의 ‘연결하기’에서 가입코드 ${code}를 넣어 주세요.`,
      url: publicUrl,
    });
    if (outcome === "copied")
      toast("공유 창이 없어 카드 내용을 복사했어요. 카카오톡에 붙여넣어 주세요");
    if (outcome === "failed")
      setShareError("보내지 못했어요. ‘인쇄’로 카드를 전하거나 주소와 코드를 직접 알려 주세요");
  }

  const dock = code ? (
    <Dock error={shareError}>
      <div className="wh-btn-row">
        <ActionButton
          className="wh-btn wh-btn--neutral"
          size="large"
          variant="neutralWeak"
          onClick={() => window.print()}
        >
          <Icon name="printer" />
          인쇄
        </ActionButton>
        <ActionButton className="wh-btn wh-grow" size="large" onClick={() => void send()}>
          <Icon name="message-circle" />
          카카오톡으로 보내기
        </ActionButton>
      </div>
    </Dock>
  ) : undefined;

  return (
    <Screen
      tone="gray"
      dock={dock}
      topbar={
        <TopBar start={<BackButton fallback={`${base}/qr`} />} title="입주 카드" titleAs="h1" />
      }
    >
      {joinCode.isError ? (
        <LoadError
          onRetry={() => void joinCode.refetch()}
          retrying={joinCode.isFetching}
          headingLevel={2}
        />
      ) : joinCode.isPending ? (
        <div className="wh-pad mc-skeleton">
          <Skeleton radius="16" height="360px" />
        </div>
      ) : code === undefined ? (
        <div className="wh-pad wh-state-top">
          <EmptyState
            icon="key-round"
            headingLevel={2}
            title="아직 가입코드가 없어요"
            description="QR과 가입코드 화면에서 코드를 만든 뒤 입주 카드를 보낼 수 있어요."
          >
            <ActionButton
              asChild
              className="wh-btn wh-btn--secondary wh-btn--sm mc-go"
              size="large"
              variant="neutralWeak"
            >
              <Link to={`${base}/qr`}>가입코드 만들러 가기</Link>
            </ActionButton>
          </EmptyState>
        </div>
      ) : (
        <>
          <article className="mc-card" aria-label={`${building.name} 입주 카드`}>
            <p className="mc-card__brand">
              <span className="mc-card__stamp" aria-hidden="true" />
              월계함
            </p>
            <h2 className="mc-card__title">{building.name} 생활 안내</h2>
            <div className="mc-qrbox">
              <div className="mc-qr">
                <QrCode value={qrUrl} label={`${building.name} 건물 안내 QR`} />
              </div>
              <div>
                <p className="mc-qrbox__title">안내는 여기서 봐요</p>
                <p className="mc-qrbox__sub">
                  {coveredTopics(detail)}. 가입하지 않아도 볼 수 있어요.
                </p>
              </div>
            </div>
            <div className="mc-cut" aria-hidden="true" />
            <p className="mc-code-title">새 공지까지 받으려면 가입코드</p>
            <p className="mc-code-sub">QR 화면의 ‘연결하기’에서 넣어 주세요</p>
            <CodeCells value={code} label="가입코드" className="mc-code" />
            <p className="mc-foot">{host}</p>
          </article>
          <p className="wh-note mc-note">
            <Icon name="info" />
            <span>가입코드가 있으니 계약한 입주자에게만 전해 주세요.</span>
          </p>
        </>
      )}
    </Screen>
  );
}
