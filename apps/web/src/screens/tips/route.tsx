// LF-06 거주자가 남긴 팁 · lofi 04(목록·hami-mini 토스트) 18(없음). 연결 전이면 44(연결 필요)를 화면으로.
// 읽기: 이 건물 active·reconfirm_needed 거주자와 집주인. 쓰기: active 거주자(작성 19는 tip-write).
import { ActionButton, Skeleton } from "@seed-design/react";
import type { Tip } from "@wolgyeham/contracts";
import { type ReactNode, useState } from "react";
import { Link, useParams } from "react-router";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import { BackButton, Dock, Screen, TopBar } from "../../components/Screen";
import { Delayed, LoadError } from "../../components/ScreenState";
import { useMe } from "../../features/auth/queries";
import { usePublicBuilding } from "../../features/buildings/queries";
import { connectPath } from "../../features/occupancy/connectDraft";
import { useTips } from "../../features/tips/queries";
import { type TipRole, tipRoleFor } from "../../features/tips/role";
import { TipCard } from "../../features/tips/TipCard";
import { OwnTipSheet, TipReportSheet } from "../../features/tips/TipSheets";
import { toAppError } from "../../lib/errors";
import "./tips.css";

export function Component() {
  const { buildingId = "" } = useParams();
  const me = useMe();
  const building = usePublicBuilding(buildingId);

  if (me.isError) {
    return (
      <TipsShell back={`/b/${buildingId}`}>
        <LoadError onRetry={() => void me.refetch()} retrying={me.isFetching} />
      </TipsShell>
    );
  }
  if (me.isPending) return <TipsLoading back={`/b/${buildingId}`} />;
  const role = tipRoleFor(me.data, buildingId);
  if (role === "outsider") return <ConnectNeeded buildingId={buildingId} />;
  return (
    <TipsList
      buildingId={buildingId}
      buildingName={building.data?.name}
      userId={me.data?.user.id}
      role={role}
    />
  );
}

function TipsShell({
  back,
  busy = false,
  dock,
  children,
}: {
  back: string;
  busy?: boolean;
  dock?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      dock={dock}
      topbar={<TopBar start={<BackButton fallback={back} />} title="생활 팁" />}
    >
      {children}
    </Screen>
  );
}

function TipsLoading({ back }: { back: string }) {
  return (
    <TipsShell back={back} busy>
      <Delayed label="생활 팁을 불러오는 중">
        <div className="wh-pad tl-skeleton">
          <Skeleton radius="8" height="28px" width="55%" />
          <Skeleton radius="8" height="40px" />
          <Skeleton radius="16" height="104px" />
          <Skeleton radius="16" height="104px" />
        </div>
      </Delayed>
    </TipsShell>
  );
}

/** 연결 필요(lofi 44를 화면으로). 연결을 마치면 이 목록으로 돌아옵니다. 함이는 넣지 않습니다. */
function ConnectNeeded({ buildingId }: { buildingId: string }) {
  const tipsPath = `/b/${buildingId}/tips`;
  return (
    <TipsShell
      back={`/b/${buildingId}`}
      dock={
        <Dock>
          <div className="wh-btn-row">
            <ActionButton
              asChild
              className="wh-btn wh-btn--neutral"
              size="large"
              variant="neutralWeak"
            >
              <Link to={`/b/${buildingId}`}>건물로 돌아가기</Link>
            </ActionButton>
            <ActionButton asChild className="wh-btn wh-grow" size="large">
              <Link to={connectPath(buildingId, tipsPath)}>우리 건물로 연결하기</Link>
            </ActionButton>
          </div>
        </Dock>
      }
    >
      <div className="wh-pad tl-connect">
        <span className="tl-connect__mark">
          <Icon name="key-round" />
        </span>
        <h1 className="tl-connect__title" tabIndex={-1}>
          생활 팁은 이 건물에 연결한 거주자가 볼 수 있어요
        </h1>
        <p className="wh-small tl-connect__lead">연결을 마치면 생활 팁으로 돌아와요.</p>
        <ul className="tl-connect__info">
          <li>
            <Icon name="ticket" />
            가입코드는 집주인이나 부동산에서 받아요
          </li>
          <li>
            <Icon name="mail" />
            <span>
              이 건물에 살지 않는다면{" "}
              <Link className="tl-connect__link" to={`/b/${buildingId}/report`}>
                ‘집주인에게 알리기’
              </Link>
              로 전할 수 있어요
            </span>
          </li>
        </ul>
      </div>
    </TipsShell>
  );
}

function TipsList({
  buildingId,
  buildingName,
  userId,
  role,
}: {
  buildingId: string;
  buildingName: string | undefined;
  userId: string | undefined;
  role: Exclude<TipRole, "outsider">;
}) {
  const tips = useTips(buildingId, userId);
  const [menuTip, setMenuTip] = useState<Tip | null>(null);
  const [ownOpen, setOwnOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const back = role === "landlord" ? `/manage/${buildingId}` : `/b/${buildingId}`;
  const writePath = `/b/${buildingId}/tips/new`;

  if (tips.isError) {
    const { code } = toAppError(tips.error);
    if (code === "NOT_CONNECTED") return <ConnectNeeded buildingId={buildingId} />;
    return (
      <TipsShell back={back}>
        <LoadError onRetry={() => void tips.refetch()} retrying={tips.isFetching} />
      </TipsShell>
    );
  }
  if (tips.isPending) return <TipsLoading back={back} />;

  const dock =
    role === "writer" ? (
      <Dock>
        <ActionButton
          asChild
          className="wh-btn wh-btn--secondary"
          size="large"
          variant="neutralWeak"
        >
          <Link to={writePath}>
            <Icon name="pencil-line" />
            생활 팁 남기기
          </Link>
        </ActionButton>
      </Dock>
    ) : role === "reconfirm" ? (
      <Dock hint="거주 확인이 필요해서 지금은 팁을 남길 수 없어요. 읽기는 그대로예요">
        <ActionButton asChild className="wh-btn wh-btn--neutral" size="large" variant="neutralWeak">
          <Link to="/me">내 정보에서 거주 확인하기</Link>
        </ActionButton>
      </Dock>
    ) : undefined;

  if (tips.data.length === 0) {
    // 팁이 없어도 거주 확인이 필요하다는 안내는 남깁니다(리뷰 L4). 쓰기 재촉은 하지 않습니다.
    return (
      <TipsShell back={back} dock={role === "reconfirm" ? dock : undefined}>
        <div className="wh-pad">
          <p className="wh-caption tl-caption">
            {buildingName ? `${buildingName} · ` : ""}연결된 거주자만 읽어요
          </p>
          <div className="tl-empty">
            <Hami pose="tray-empty" size={150} className="tl-empty__hami" eager />
            <h1 className="tl-empty__title" tabIndex={-1}>
              아직 남겨진 팁이 없어요
            </h1>
            {role === "writer" ? (
              <ActionButton
                asChild
                className="wh-btn wh-btn--neutral wh-btn--sm tl-empty__write"
                size="large"
                variant="neutralWeak"
              >
                <Link to={writePath}>
                  <Icon name="pencil-line" />
                  생활 팁 남기기
                </Link>
              </ActionButton>
            ) : null}
          </div>
        </div>
      </TipsShell>
    );
  }

  return (
    <TipsShell back={back} dock={dock}>
      <div className="wh-pad">
        <h1 className="wh-h-title tl-title" tabIndex={-1}>
          거주자가 남긴 팁
        </h1>
        <p className="tl-scope">
          <Icon name="lock-keyhole" />
          <span>집주인 안내가 아닌 참고 정보 · 다른 거주자에게 작성자가 안 보여요</span>
        </p>
        <ul className="tl-list">
          {tips.data.map((tip) => (
            <li key={tip.id}>
              <TipCard
                tip={tip}
                onMenu={() => {
                  setMenuTip(tip);
                  if (tip.mine) setOwnOpen(true);
                  else setReportOpen(true);
                }}
                footer={
                  tip.mine ? <p className="tl-own">‘내 팁’ 표시는 나에게만 보여요</p> : undefined
                }
              />
            </li>
          ))}
        </ul>
      </div>
      <OwnTipSheet tip={menuTip} open={ownOpen} onOpenChange={setOwnOpen} />
      <TipReportSheet
        tip={menuTip}
        open={reportOpen}
        onOpenChange={setReportOpen}
        onGone={() => void tips.refetch()}
        byLandlord={role === "landlord"}
      />
    </TipsShell>
  );
}
