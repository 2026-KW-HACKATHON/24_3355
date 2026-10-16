// LF-18 안내 스티커(A4 인쇄·한 장씩 PNG). QR과 가입코드(26)에서 들어옵니다. 공개한 안내마다 5×5cm 스티커
// (종류 · 제목 · 그 안내 QR · 월계함)를 만들어 분리수거장·택배함처럼 안내가 필요한 자리에 붙입니다.
import { ActionButton } from "@seed-design/react";
import type { Guide, ManagedBuildingDetail } from "@wolgyeham/contracts";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { QrCode } from "../../components/QrCode";
import { BackButton, Dock, Screen, TopBar } from "../../components/Screen";
import { EmptyState } from "../../components/ScreenState";
import { useToast } from "../../components/useToast";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { CATEGORY } from "../../features/guides/categories";
import { publicGuideStickerUrl, publicOrigin } from "../../lib/share";
import { STICKER_HINT, STICKERS_PER_PAGE, stickerGuides, stickerPages } from "./stickerContent";
import { downloadStickerPng } from "./stickerImage";
import "./guide-stickers.css";

export function Component() {
  const { buildingId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>
      {(detail) => <GuideStickers detail={detail} />}
    </ManagerGate>
  );
}

function stickerDomId(guideId: string) {
  return `st-${guideId}`;
}

function Sticker({ guide, qrValue }: { guide: Guide; qrValue: string }) {
  const category = CATEGORY[guide.category];
  return (
    <article
      id={stickerDomId(guide.id)}
      className="st-sticker"
      aria-label={`${guide.title} 스티커`}
    >
      <p className="st-sticker__cat">
        <Icon name={category.icon} />
        {category.label}
      </p>
      <p className="st-sticker__title">{guide.title}</p>
      <div className="st-sticker__qr">
        <QrCode value={qrValue} label={`${guide.title} 안내 QR`} />
      </div>
      <p className="st-sticker__foot">
        <span className="st-sticker__brand">월계함</span>
        <span>{STICKER_HINT}</span>
      </p>
    </article>
  );
}

function GuideStickers({ detail }: { detail: ManagedBuildingDetail }) {
  const { building } = detail;
  const base = `/manage/${building.id}`;
  const origin = publicOrigin();
  const guides = stickerGuides(detail.guides);
  const pages = stickerPages(guides);
  const toast = useToast();
  const [downloadError, setDownloadError] = useState<string>();
  const qrValue = (guide: Guide) => publicGuideStickerUrl(building.id, guide.id, origin);

  async function download(guide: Guide) {
    setDownloadError(undefined);
    const ok = await downloadStickerPng(
      {
        qrValue: qrValue(guide),
        categoryLabel: CATEGORY[guide.category].label,
        title: guide.title,
        icon: document.querySelector<SVGSVGElement>(`#${stickerDomId(guide.id)} svg`),
      },
      `${building.name}-${guide.title}-스티커.png`,
    );
    if (ok) toast("스티커 이미지를 내려받았어요");
    else setDownloadError("이미지를 만들지 못했어요. ‘인쇄하기’로 PDF를 저장해 주세요");
  }

  return (
    <Screen
      tone="gray"
      topbar={
        <TopBar start={<BackButton fallback={`${base}/qr`} />} title="안내 스티커" titleAs="h1" />
      }
      dock={
        guides.length > 0 ? (
          <Dock>
            <ActionButton className="wh-btn" size="large" onClick={() => window.print()}>
              <Icon name="printer" />
              인쇄하기
            </ActionButton>
          </Dock>
        ) : undefined
      }
    >
      {guides.length === 0 ? (
        <div className="wh-pad wh-state-top">
          <EmptyState
            icon="book-open"
            headingLevel={2}
            title="공개한 안내가 없어요"
            description="안내를 공개하면 안내마다 붙일 QR 스티커를 만들 수 있어요."
          >
            <ActionButton
              asChild
              className="wh-btn wh-btn--secondary wh-btn--sm st-go"
              size="large"
              variant="neutralWeak"
            >
              <Link to={base}>건물 관리로 가기</Link>
            </ActionButton>
          </EmptyState>
        </div>
      ) : (
        <>
          <p className="wh-pad wh-small st-lead st-screen-only">
            안내마다 5×5cm 스티커예요. QR을 비추면 그 안내가 바로 열려요. A4 한 장에{" "}
            {STICKERS_PER_PAGE}개씩 들어가고, 점선을 따라 오려 붙여요.
          </p>
          <div className="st-pages">
            {pages.map((page, index) => (
              <section
                key={page[0]?.id ?? index}
                className="st-sheet"
                aria-label={`안내 스티커 ${index + 1}쪽`}
              >
                {page.map((guide) => (
                  <Sticker key={guide.id} guide={guide} qrValue={qrValue(guide)} />
                ))}
              </section>
            ))}
          </div>
          <section className="wh-pad st-controls st-screen-only" aria-labelledby="st-one">
            <h2 id="st-one" className="wh-group-title st-one-title">
              한 장씩 이미지로 받기
            </h2>
            <ul className="st-one-list">
              {guides.map((guide) => (
                <li key={guide.id} className="st-one">
                  <span className="st-one__text">
                    <span className="st-one__cat">{CATEGORY[guide.category].label}</span>
                    <span className="st-one__title">{guide.title}</span>
                  </span>
                  <ActionButton
                    className="wh-btn wh-btn--secondary wh-btn--sm"
                    size="large"
                    variant="neutralWeak"
                    aria-label={`${guide.title} 스티커 내려받기`}
                    onClick={() => void download(guide)}
                  >
                    <Icon name="download" />
                    PNG
                  </ActionButton>
                </li>
              ))}
            </ul>
            {downloadError ? (
              <p className="wh-field-error" role="alert">
                {downloadError}
              </p>
            ) : null}
          </section>
        </>
      )}
    </Screen>
  );
}
