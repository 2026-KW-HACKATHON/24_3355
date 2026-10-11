// 현관 안내문(A4 인쇄). QR과 가입코드(26)에서 들어옵니다. 배치는 팀 현관 포스터(남색 주소판 · 큰 문구 · 가운데 QR ·
// 함이)를 따르고, 건물 이름·주소·안내 종류·QR은 이 건물 데이터로 채웁니다.
import { ActionButton } from "@seed-design/react";
import type { ManagedBuildingDetail } from "@wolgyeham/contracts";
import { useState } from "react";
import { useParams } from "react-router";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import { QrCode } from "../../components/QrCode";
import { BackButton, Dock, Screen, TopBar } from "../../components/Screen";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { useJoinCode } from "../../features/buildings/queries";
import { CATEGORY_ORDER, joinCategoryLabels } from "../../features/guides/categories";
import { publicBuildingQrUrl, publicOrigin } from "../../lib/share";
import "./entrance-sign.css";

export function Component() {
  const { buildingId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>
      {(detail) => <EntranceSign detail={detail} />}
    </ManagerGate>
  );
}

/** “서울 노원구 광운로 20” → 위 작은 줄 “서울 노원구”, 큰 줄 “광운로 20”. 구 이름을 못 찾으면 주소 전체를 큰 줄에 둡니다. */
export function splitAddress(fullAddress: string): { district: string; road: string } {
  const words = fullAddress.trim().split(/\s+/);
  const gu = words.findIndex((word) => /(구|군|시)$/.test(word) && word !== words[0]);
  if (gu === -1 || gu === words.length - 1) return { district: "", road: fullAddress.trim() };
  return { district: words.slice(0, gu + 1).join(" "), road: words.slice(gu + 1).join(" ") };
}

function EntranceSign({ detail }: { detail: ManagedBuildingDetail }) {
  const { building, guides } = detail;
  const base = `/manage/${building.id}`;
  const qrUrl = publicBuildingQrUrl(building.id, publicOrigin());
  const { district, road } = splitAddress(building.fullAddress);
  const used = new Set(guides.filter((g) => g.status === "published").map((g) => g.category));
  const topics = joinCategoryLabels(CATEGORY_ORDER.filter((category) => used.has(category)));
  const joinCode = useJoinCode(building.id);
  const code = joinCode.data?.code;
  // 가입코드는 현관에 함께 붙이지 않는 것이 기본 규칙(26)이라 처음엔 빼 두고, 전시처럼 열어 둔 곳에서만 켭니다.
  const [withCode, setWithCode] = useState(false);

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
            이 건물의 안내,
            <br />
            여기서 확인하세요.
          </h2>
          <div className="es-qr">
            <QrCode value={qrUrl} label={`${building.name} 건물 안내 QR`} />
          </div>
          <Hami pose="qr-sign" size={330} className="es-hami" eager />
          <p className="es-scan">카메라로 QR을 비추면 가입 없이 안내가 열려요</p>
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
