// LF-09 내 정보 › 내가 남긴 팁. 나에게만 보이고, 지금 연결된 건물의 팁만 고치거나 지울 수 있어요.
// 운영팀이 가린 팁은 ‘가려짐’으로 보이고(D-22), 이사한 건물의 팁은 운영팀 요청으로 지웁니다.
import type { Me, MyTip } from "@wolgyeham/contracts";
import { type ReactNode, useState } from "react";
import { Icon } from "../../components/Icon";
import { BackButton, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError, SkeletonLines } from "../../components/ScreenState";
import { ResidentTabs } from "../../components/TabBar";
import { SignedInPage } from "../../features/me/SignedInPage";
import { useMyTips } from "../../features/tips/queries";
import { TipCard } from "../../features/tips/TipCard";
import { OwnTipSheet } from "../../features/tips/TipSheets";
import "./my-tips.css";

export function Component() {
  return <SignedInPage title="내가 남긴 팁">{(me) => <MyTips me={me} />}</SignedInPage>;
}

function MyTipsShell({
  me,
  busy = false,
  children,
}: {
  me: Me;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      tabs={
        me.occupancy ? <ResidentTabs buildingId={me.occupancy.buildingId} active="me" /> : undefined
      }
      topbar={<TopBar start={<BackButton fallback="/me" />} title="내가 남긴 팁" titleAs="h1" />}
    >
      <p className="mt-info">
        <Icon name="lock-keyhole" />
        <span>이 목록은 나에게만 보여요. 다른 거주자에게는 작성자 없이 팁만 보여요.</span>
      </p>
      {children}
    </Screen>
  );
}

function tipNote(tip: MyTip): string | undefined {
  if (tip.hidden) return "운영팀이 가려 다른 거주자에게 보이지 않아요";
  if (!tip.editable)
    return "이사한 건물의 팁이라 고치거나 지울 수 없어요. 지우려면 운영팀에 요청해 주세요";
  return undefined;
}

function MyTips({ me }: { me: Me }) {
  const tips = useMyTips(me.user.id);
  const [menuTip, setMenuTip] = useState<MyTip | null>(null);
  const [open, setOpen] = useState(false);

  if (tips.isError) {
    return (
      <MyTipsShell me={me}>
        <LoadError
          headingLevel={2}
          onRetry={() => void tips.refetch()}
          retrying={tips.isFetching}
        />
      </MyTipsShell>
    );
  }
  if (tips.isPending) {
    return (
      <MyTipsShell me={me} busy>
        <Delayed label="내가 남긴 팁을 불러오는 중">
          <div className="wh-pad mt-skeleton">
            <SkeletonLines lines={3} />
            <SkeletonLines lines={3} />
          </div>
        </Delayed>
      </MyTipsShell>
    );
  }
  if (tips.data.length === 0) {
    return (
      <MyTipsShell me={me}>
        <div className="wh-pad mt-empty">
          <EmptyState
            icon="sticky-note"
            headingLevel={2}
            title="아직 남긴 팁이 없어요"
            description="연결한 건물의 생활 팁에서 남길 수 있어요."
          />
        </div>
      </MyTipsShell>
    );
  }
  return (
    <MyTipsShell me={me}>
      <ul className="wh-pad mt-list">
        {tips.data.map((tip) => {
          const note = tipNote(tip);
          return (
            <li key={tip.id}>
              <p className="mt-building">{tip.buildingName}</p>
              <TipCard
                tip={tip}
                extraBadge={
                  tip.hidden ? (
                    <span className="wh-badge wh-badge--hard">
                      <Icon name="eye-off" />
                      가려짐
                    </span>
                  ) : null
                }
                onMenu={
                  tip.editable
                    ? () => {
                        setMenuTip(tip);
                        setOpen(true);
                      }
                    : undefined
                }
                footer={note ? <p className="mt-note">{note}</p> : undefined}
              />
            </li>
          );
        })}
      </ul>
      <OwnTipSheet
        tip={menuTip}
        open={open}
        onOpenChange={setOpen}
        canEdit={menuTip ? !menuTip.hidden : true}
      />
    </MyTipsShell>
  );
}
