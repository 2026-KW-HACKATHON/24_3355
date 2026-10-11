// LF-18 현관 안내문(A4 인쇄·이미지 내려받기). QR과 가입코드(26)에서 들어옵니다. 배치는 팀 현관 포스터(남색 주소판 · 큰 문구 · 가운데 QR ·
// 함이)를 따르고, 건물 이름·주소·안내 종류·QR은 이 건물 데이터로 채웁니다.
import { ActionButton } from "@seed-design/react";
import type { ManagedBuildingDetail } from "@wolgyeham/contracts";
import { useState } from "react";
import { useParams } from "react-router";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import { QrCode } from "../../components/QrCode";
import { BackButton, Dock, Screen, TopBar } from "../../components/Screen";
import { useToast } from "../../components/useToast";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { useJoinCode } from "../../features/buildings/queries";
import { publicBuildingQrUrl, publicOrigin } from "../../lib/share";
import { SIGN_SCAN, SIGN_TITLE, signTopics, splitAddress } from "./signContent";
import { downloadEntranceSignPng } from "./signImage";
import "./entrance-sign.css";

export function Component() {
  const { buildingId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>
      {(detail) => <EntranceSign detail={detail} />}
    </ManagerGate>
  );
}

function EntranceSign({ detail }: { detail: ManagedBuildingDetail }) {
  const { building, guides } = detail;
  const base = `/manage/${building.id}`;
  const qrUrl = publicBuildingQrUrl(building.id, publicOrigin());
  const { district, road } = splitAddress(building.fullAddress);
  const topics = signTopics(guides);
  const joinCode = useJoinCode(building.id);
  const code = joinCode.data?.code;
  // 가입코드는 현관에 함께 붙이지 않는 것이 기본 규칙(26)이라 처음엔 빼 두고, 전시처럼 열어 둔 곳에서만 켭니다.
  const [withCode, setWithCode] = useState(false);
  const toast = useToast();
  const [downloadError, setDownloadError] = useState<string>();

  // 인쇄 대신 파일로 받아 직접 고치거나 인쇄소에 맡길 때 씁니다. 화면에 보이는 그대로(가입코드 포함 여부까지) 그립니다.
  async function download() {
    setDownloadError(undefined);
    const ok = await downloadEntranceSignPng(
      {
        qrValue: qrUrl,
        buildingName: building.name,
        district,
        road,
        topics,
        joinCode: code && withCode ? code : undefined,
      },
      `${building.name}-현관-안내문.png`,
    );
    if (ok) toast("현관 안내문 이미지를 내려받았어요");
    else setDownloadError("이미지를 만들지 못했어요. ‘인쇄하기’로 PDF를 저장해 주세요");
  }

  return (
    <Screen
      tone="gray"
      topbar={
        <TopBar start={<BackButton fallback={`${base}/qr`} />} title="현관 안내문" titleAs="h1" />
      }
      dock={
        <Dock>
          <ActionButton className="wh-btn" size="large" onClick={() => window.print()}>
            <Icon name="printer" />
            인쇄하기
          </ActionButton>
        </Dock>
      }
    >
      <div className="es-page">
        <article className="es-sheet" aria-label={`${building.name} 현관 안내문`}>
          <div className="es-plate">
            {district ? <p className="es-plate__district">{district}</p> : null}
            <p className="es-plate__road">{road}</p>
          </div>
          <p className="es-building">{building.name} 생활안내</p>
          <h2 className="es-title">
            {SIGN_TITLE[0]}
            <br />
            {SIGN_TITLE[1]}
          </h2>
          <div className="es-qr">
            <QrCode value={qrUrl} label={`${building.name} 건물 안내 QR`} />
          </div>
          <Hami pose="qr-sign" size={330} className="es-hami" eager />
          <p className="es-scan">{SIGN_SCAN}</p>
          {topics ? <p className="es-topics">{topics}</p> : null}
          <div className="es-bottom">
            <p className="es-brand">월계함</p>
            {code && withCode ? (
              <p className="es-code">
                <span className="es-code__label">알림 받기 가입코드</span>
                <span className="es-code__value">{code}</span>
              </p>
            ) : null}
          </div>
        </article>
      </div>

      <div className="wh-pad es-controls es-screen-only">
        <ActionButton
          className="wh-btn wh-btn--secondary"
          size="large"
          variant="neutralWeak"
          onClick={() => void download()}
        >
          <Icon name="download" />
          이미지로 내려받기
        </ActionButton>
        {downloadError ? (
          <p className="wh-field-error" role="alert">
            {downloadError}
          </p>
        ) : null}
        {code ? (
          <label className="es-toggle">
            <input
              type="checkbox"
              checked={withCode}
              onChange={(event) => setWithCode(event.target.checked)}
            />
            가입코드도 함께 싣기
          </label>
        ) : null}
        <p className="wh-note">
          <Icon name="info" />
          <span>
            {joinCode.isError
              ? "가입코드를 불러오지 못해 QR만 실었어요. 다시 열면 함께 실을 수 있어요."
              : code
                ? "가입코드가 실리면 누구나 연결할 수 있어요. 전시처럼 모두에게 열어 둔 곳에만 실어 주세요."
                : "가입코드가 없어 QR만 실었어요. ‘QR과 가입코드’에서 만들 수 있어요."}
          </span>
        </p>
      </div>
    </Screen>
  );
}
