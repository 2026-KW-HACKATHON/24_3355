// LF-18 QR과 가입코드 · lofi 26 (입주 카드 39는 move-in-card)
import { ActionButton, Dialog, Portal, Skeleton } from "@seed-design/react";
import type { ManagedBuildingDetail } from "@wolgyeham/contracts";
import { type ReactNode, useState } from "react";
import { Link, useParams } from "react-router";
import { CodeCells } from "../../components/CodeCells";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import { downloadQrPng, QrCode } from "../../components/QrCode";
import { BackButton, Screen, TopBar } from "../../components/Screen";
import { LoadError } from "../../components/ScreenState";
import { useToast } from "../../components/useToast";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { useJoinCode, useRotateJoinCode } from "../../features/buildings/queries";
import { errorMessage } from "../../lib/errors";
import { copyText, publicBuildingQrUrl, publicBuildingUrl } from "../../lib/share";
import "./qr-code.css";

export function Component() {
  const { buildingId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>{(detail) => <QrAndCode detail={detail} />}</ManagerGate>
  );
}

function QrAndCode({ detail }: { detail: ManagedBuildingDetail }) {
  const { building } = detail;
  const base = `/manage/${building.id}`;
  const publicUrl = publicBuildingUrl(building.id);
  // QR에는 `?via=qr`을 담고, 사람이 읽는 캡션은 주소만 적습니다.
  const qrUrl = publicBuildingQrUrl(building.id);
  const toast = useToast();
  const [downloadError, setDownloadError] = useState<string>();

  async function download() {
    setDownloadError(undefined);
    const ok = await downloadQrPng({
      value: qrUrl,
      title: building.name,
      caption: publicUrl.replace(/^https?:\/\//, ""),
      fileName: `${building.name}-현관-QR.png`,
    });
    if (ok) toast("현관 QR 이미지를 내려받았어요");
    else setDownloadError("이미지를 만들지 못했어요. 화면의 QR을 캡처해 인쇄해도 돼요");
  }

  return (
    <Screen
      topbar={<TopBar start={<BackButton fallback={base} />} title="QR과 가입코드" titleAs="h1" />}
    >
      <div className="wh-pad qc-body">
        <div className="qc-intro">
          <p className="wh-small">
            두 가지는 쓰임이 달라요.
            <br />
            따로 전해 주세요.
          </p>
          <Hami pose="qr-sign" size={104} eager />
        </div>

        <section className="qc-block" aria-labelledby="qc-qr-title">
          <div className="qc-block__head">
            <h2 id="qc-qr-title">현관 QR</h2>
            <span className="wh-badge wh-badge--gray">누구나</span>
          </div>
          <div className="qc-qr-row">
            <div className="qc-qr">
              <QrCode value={qrUrl} label={`${building.name} 건물 안내 QR`} />
            </div>
            <div className="qc-qr-row__side">
              <p>현관에 붙여 두면 누구나 안내를 읽고 집주인에게 알릴 수 있어요.</p>
              <ActionButton
                className="wh-btn wh-btn--secondary wh-btn--sm qc-download"
                size="large"
                variant="neutralWeak"
                onClick={() => void download()}
              >
                <Icon name="download" />
                인쇄용 내려받기
              </ActionButton>
            </div>
          </div>
          {downloadError ? (
            <p className="wh-field-error" role="alert">
              {downloadError}
            </p>
          ) : null}
        </section>

        <JoinCodeBlock buildingId={building.id} buildingName={building.name} base={base} />

        <p className="qc-warn">
          <Icon name="triangle-alert" />
          <span>가입코드를 현관 QR 옆에 함께 붙이지 마세요.</span>
        </p>
      </div>
    </Screen>
  );
}

function JoinCodeBlock({
  buildingId,
  buildingName,
  base,
}: {
  buildingId: string;
  buildingName: string;
  base: string;
}) {
  const joinCode = useJoinCode(buildingId);
  const rotate = useRotateJoinCode(buildingId);
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copyError, setCopyError] = useState<string>();

  async function copy(code: string) {
    setCopyError(undefined);
    if (await copyText(code)) toast("가입코드를 복사했어요");
    else setCopyError("복사하지 못했어요. 코드를 보고 직접 전해 주세요");
  }

  function create() {
    rotate.mutate(undefined, {
      onSuccess: () => {
        setConfirmOpen(false);
        toast(joinCode.data ? "가입코드를 바꿨어요" : "가입코드를 만들었어요");
      },
    });
  }

  let content: ReactNode;
  if (joinCode.isError) {
    content = (
      <LoadError
        onRetry={() => void joinCode.refetch()}
        retrying={joinCode.isFetching}
        headingLevel={2}
      />
    );
  } else if (joinCode.isPending) {
    content = <Skeleton radius="16" height="48px" />;
  } else if (joinCode.data === null) {
    content = (
      <>
        <p className="qc-empty">아직 가입코드가 없어요. 만들면 입주자에게 전할 수 있어요.</p>
        <ActionButton
          className="wh-btn qc-create"
          size="large"
          loading={rotate.isPending}
          disabled={rotate.isPending}
          onClick={create}
        >
          <Icon name="key-round" />
          가입코드 만들기
        </ActionButton>
      </>
    );
  } else {
    const code = joinCode.data.code;
    content = (
      <>
        <CodeCells compact value={code} label="현재 가입코드" className="qc-code" />
        <div className="qc-actions">
          <ActionButton
            className="wh-btn wh-btn--neutral"
            size="large"
            variant="neutralWeak"
            onClick={() => void copy(code)}
          >
            <Icon name="copy" />
            복사
          </ActionButton>
          <ActionButton
            className="wh-btn wh-btn--neutral"
            size="large"
            variant="neutralWeak"
            onClick={() => setConfirmOpen(true)}
          >
            <Icon name="refresh-cw" />
            코드 바꾸기
          </ActionButton>
        </div>
        <p className="wh-caption qc-caption">바꿔도 이미 연결된 거주자는 그대로예요.</p>
        {copyError ? (
          <p className="wh-field-error" role="alert">
            {copyError}
          </p>
        ) : null}
        <ActionButton
          asChild
          className="wh-btn wh-btn--secondary qc-card"
          size="large"
          variant="neutralWeak"
        >
          <Link to={`${base}/card`}>
            <Icon name="send" />
            입주 카드 카카오톡으로 보내기
          </Link>
        </ActionButton>
        <p className="wh-caption qc-caption">
          QR과 가입코드가 함께 담긴 카드예요. 계약한 입주자에게만 보내 주세요.
        </p>
      </>
    );
  }

  return (
    <section className="qc-block" aria-labelledby="qc-code-title">
      <div className="qc-block__head">
        <h2 id="qc-code-title">거주자 가입코드</h2>
        <span className="wh-badge wh-badge--navy">입주자에게만</span>
      </div>
      <div className="qc-code-body">{content}</div>
      {rotate.isError && !confirmOpen ? (
        <p className="wh-field-error" role="alert">
          가입코드를 만들지 못했어요. {errorMessage(rotate.error)}
        </p>
      ) : null}

      <Dialog.Root
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!rotate.isPending) setConfirmOpen(next);
        }}
      >
        <Portal>
          <Dialog.Positioner>
            <Dialog.Backdrop />
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>가입코드를 바꿀까요?</Dialog.Title>
                <Dialog.Description>
                  지금 코드는 바로 쓸 수 없게 돼요. {buildingName}에 이미 연결된 거주자는
                  그대로이고, 새로 들어올 분에게는 새 코드를 전해 주세요.
                </Dialog.Description>
              </Dialog.Header>
              {rotate.isError ? (
                <p className="wh-dock__error qc-dialog-error" role="alert">
                  바꾸지 못했어요. {errorMessage(rotate.error)}
                </p>
              ) : null}
              <Dialog.Footer>
                <div className="wh-btn-row">
                  <ActionButton
                    className="wh-btn wh-btn--neutral"
                    size="large"
                    variant="neutralWeak"
                    disabled={rotate.isPending}
                    onClick={() => setConfirmOpen(false)}
                  >
                    그대로 두기
                  </ActionButton>
                  <ActionButton
                    className="wh-btn"
                    size="large"
                    loading={rotate.isPending}
                    disabled={rotate.isPending}
                    onClick={create}
                  >
                    코드 바꾸기
                  </ActionButton>
                </div>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </section>
  );
}
