// LF-12 건물 준비 완료 · lofi 38 (첫 안내를 공개한 뒤 한 번)
import { ActionButton } from "@seed-design/react";
import type { ManagedBuildingDetail } from "@wolgyeham/contracts";
import { type ReactNode, useState } from "react";
import { Link, useParams } from "react-router";
import { Icon, type IconName } from "../../components/Icon";
import { Dock, Screen } from "../../components/Screen";
import { useToast } from "../../components/useToast";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { joinCategoryLabels, missingCategories } from "../../features/guides/categories";
import { copyText, publicBuildingUrl } from "../../lib/share";
import "./setup-done.css";

function StepFace({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  return (
    <>
      <span className="sd-step__ic">
        <Icon name={icon} />
      </span>
      <span className="sd-step__text">
        <span className="sd-step__title">{title}</span>
        <span className="sd-step__sub">{sub}</span>
      </span>
      <Icon name="chevron-right" className="sd-step__chev" />
    </>
  );
}

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
  const base = `/manage/${building.id}`;
  const toast = useToast();
  const [copyError, setCopyError] = useState<ReactNode>();

  async function copyLink() {
    const url = publicBuildingUrl(building.id);
    setCopyError(undefined);
    if (await copyText(url)) toast("건물 안내 링크를 복사했어요");
    else setCopyError(`복사하지 못했어요. 이 주소를 전해 주세요: ${url}`);
  }

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
          <li>
            <Link className="sd-step" to={`${base}/qr`}>
              <StepFace
                icon="qr-code"
                title="현관 QR 받기"
                sub="현관이나 분리수거함 옆에 붙여 주세요"
              />
            </Link>
          </li>
          <li>
            <Link className="sd-step" to={`${base}/card`}>
              <StepFace
                icon="id-card"
                title="입주 카드 받기"
                sub="새 입주자에게 계약할 때 전해 주세요"
              />
            </Link>
          </li>
          <li>
            <button type="button" className="sd-step" onClick={() => void copyLink()}>
              <StepFace
                icon="link"
                title="건물 안내 링크 복사"
                sub="지금 사는 분들께 카톡으로 한 번 보내 주세요"
              />
            </button>
            {copyError ? (
              <p className="wh-field-error sd-copy-error" role="alert">
                {copyError}
              </p>
            ) : null}
          </li>
        </ul>
      </div>
    </Screen>
  );
}
