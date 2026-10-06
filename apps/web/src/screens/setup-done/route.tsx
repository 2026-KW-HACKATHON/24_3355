// LF-12 건물 준비 완료 · lofi 38 (첫 안내를 공개한 뒤 한 번)
import { ActionButton } from "@seed-design/react";
import type { ManagedBuildingDetail } from "@wolgyeham/contracts";
import { Link, useParams } from "react-router";
import { Icon, type IconName } from "../../components/Icon";
import { Dock, Screen, SoonNote } from "../../components/Screen";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { joinCategoryLabels, missingCategories } from "../../features/guides/categories";
import "./setup-done.css";

const NEXT_STEPS: ReadonlyArray<{ id: string; icon: IconName; title: string; sub: string }> = [
  { id: "qr", icon: "qr-code", title: "현관 QR 받기", sub: "현관이나 분리수거함 옆에 붙여 주세요" },
  {
    id: "card",
    icon: "id-card",
    title: "입주 카드 받기",
    sub: "새 입주자에게 계약할 때 전해 주세요",
  },
  {
    id: "link",
    icon: "link",
    title: "건물 안내 링크 복사",
    sub: "지금 사는 분들께 카톡으로 한 번 보내 주세요",
  },
];

export function Component() {
  const { buildingId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>{(detail) => <SetupDone detail={detail} />}</ManagerGate>
  );
}

function SetupDone({ detail }: { detail: ManagedBuildingDetail }) {
  const { building, guides } = detail;
  const published = guides.filter((guide) => guide.status === "published");
  const missing = joinCategoryLabels(missingCategories(published)).replaceAll(" · ", "·");

  return (
    <Screen
      dock={
        <Dock>
          <ActionButton asChild className="wh-btn" size="large">
            <Link to={`/manage/${building.id}`} replace>
              관리 홈으로
            </Link>
          </ActionButton>
        </Dock>
      }
    >
      <div className="wh-pad sd-hero">
        <span className="sd-ok">
          <Icon name="check" strokeWidth={2.6} />
        </span>
        <h1 className="wh-h-display sd-title" tabIndex={-1}>
          {building.name} 월계함이
          <br />
          준비됐어요
        </h1>
        <p className="sd-check">
          <Icon name="circle-check" />
          기본 안내 {published.length}개가 현관 QR에 보여요
        </p>
        {missing ? (
          <p className="wh-caption sd-check-sub">
            {missing} 안내는 관리 홈에서 이어서 추가할 수 있어요
          </p>
        ) : null}

        <ul className="sd-steps">
          {NEXT_STEPS.map((step) => (
            <li key={step.id}>
              <button
                type="button"
                className="sd-step"
                disabled
                aria-describedby={`sd-soon-${step.id}`}
              >
                <span className="sd-step__ic">
                  <Icon name={step.icon} />
                </span>
                <span className="sd-step__text">
                  <span className="sd-step__title">{step.title}</span>
                  <span className="sd-step__sub">{step.sub}</span>
                  <SoonNote id={`sd-soon-${step.id}`} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  );
}
