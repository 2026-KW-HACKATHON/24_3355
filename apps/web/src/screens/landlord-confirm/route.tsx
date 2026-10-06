// LF-12 건물 확인 · lofi 23. 초대를 수락한 뒤 아직 확인하지 않은 건물(confirmedAt null)만. 이름은 고칠 수 있고
// 주소는 팀이 확인한 값이라 잠겨 있습니다. ‘맞아요’ → 첫 안내 쓰기(33), 안내가 이미 있으면 관리 홈.
import { ActionButton } from "@seed-design/react";
import type { ManagedBuildingDetail } from "@wolgyeham/contracts";
import { useId, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import { Dock, Screen, TopBar } from "../../components/Screen";
import { LoginAgainButton } from "../../features/auth/LoginAgainButton";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { useConfirmBuilding } from "../../features/buildings/queries";
import { errorMessage, toAppError } from "../../lib/errors";
import { teamContactUrl } from "../../lib/teamContact";
import { buildingNameError, confirmBody, confirmDestination, needsConfirm } from "./confirm";
import "./landlord-confirm.css";

export function Component() {
  const { buildingId = "" } = useParams();
  return (
    // 다른 건물의 23으로 바로 옮겨 가도 판정·입력한 이름이 이어지지 않게 건물마다 새로 그립니다.
    <ManagerGate buildingId={buildingId}>
      {(detail) => <ConfirmGate key={detail.building.id} detail={detail} />}
    </ManagerGate>
  );
}

/**
 * 이미 확인한 건물은 23을 건너뜁니다. 처음 열 때 한 번만 판정합니다: 여기서 ‘맞아요’를 누르면 캐시의
 * confirmedAt이 채워지는데, 그때 다시 판정하면 관리 홈으로 넘어가 33으로 가는 이동을 덮습니다(QA).
 */
function ConfirmGate({ detail }: { detail: ManagedBuildingDetail }) {
  const [askHere] = useState(() => needsConfirm(detail));
  if (!askHere) return <Navigate replace to={`/manage/${detail.building.id}`} />;
  return <ConfirmBuilding detail={detail} />;
}

function ConfirmBuilding({ detail }: { detail: ManagedBuildingDetail }) {
  const { building } = detail;
  const navigate = useNavigate();
  const confirm = useConfirmBuilding(building.id);
  const inFlight = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(building.name);
  const [nameError, setNameError] = useState<string>();
  const ids = useId();
  const contact = teamContactUrl();
  const hasGuides = detail.guides.length > 0;

  async function handleConfirm() {
    if (inFlight.current) return;
    const invalid = buildingNameError(name);
    setNameError(invalid);
    if (invalid) {
      nameRef.current?.focus();
      return;
    }
    inFlight.current = true;
    try {
      await confirm.mutateAsync(confirmBody(building.name, name));
      void navigate(confirmDestination(detail), { replace: true });
    } catch (error) {
      // 입력은 그대로 둡니다. 이름 문제는 입력칸 아래, 나머지는 버튼 위에 둡니다.
      const appError = toAppError(error);
      if (appError.code === "VALIDATION_FAILED" && appError.fields["name"] !== undefined) {
        setNameError(buildingNameError(name) ?? "건물 이름을 확인해 주세요");
        nameRef.current?.focus();
      }
    } finally {
      inFlight.current = false;
    }
  }

  const error = confirm.error ? toAppError(confirm.error) : undefined;
  const signedOut = error?.code === "UNAUTHENTICATED";
  const dockError =
    !error || (error.code === "VALIDATION_FAILED" && error.fields["name"] !== undefined)
      ? undefined
      : error.code === "NETWORK" || error.code === "INTERNAL_ERROR"
        ? "저장하지 못했어요. 입력한 이름은 그대로예요. 다시 눌러 주세요"
        : error.code === "NOT_FOUND"
          ? "이 건물을 찾을 수 없어요. 관리 홈에서 다시 열어 주세요"
          : errorMessage(error);

  return (
    <Screen
      topbar={
        <TopBar
          start={
            <button
              type="button"
              className="wh-icon-btn"
              aria-label="닫기"
              onClick={() => void navigate(`/manage/${building.id}`, { replace: true })}
            >
              <Icon name="x" />
            </button>
          }
          title="건물 확인"
        />
      }
      dock={
        <Dock error={dockError}>
          {signedOut ? (
            // 로그인이 끝났으면 다시 로그인하고 이 화면으로 돌아옵니다(고친 이름은 다시 적어야 해요).
            <LoginAgainButton />
          ) : (
            <ActionButton
              className="wh-btn"
              size="large"
              loading={confirm.isPending}
              disabled={confirm.isPending}
              onClick={() => void handleConfirm()}
            >
              {hasGuides ? "맞아요, 관리 홈으로" : "맞아요, 안내 쓰기"}
            </ActionButton>
          )}
        </Dock>
      }
    >
      <div className="wh-pad lc-body">
        <div className="lc-head">
          <h1 className="wh-h-title" tabIndex={-1}>
            초대받은 건물이
            <br />
            맞나요?
          </h1>
          <Hami pose="clipboard" size={118} eager />
        </div>

        <label className="wh-field-label lc-label" htmlFor={`${ids}-name`}>
          건물 이름
        </label>
        <input
          ref={nameRef}
          id={`${ids}-name`}
          className="wh-input"
          type="text"
          autoComplete="off"
          enterKeyHint="done"
          value={name}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${ids}-name-error ${ids}-name-hint` : `${ids}-name-hint`}
          onChange={(event) => {
            setName(event.target.value);
            if (nameError) setNameError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void handleConfirm();
            }
          }}
        />
        {nameError ? (
          <p className="wh-field-error" id={`${ids}-name-error`} role="alert">
            {nameError}
          </p>
        ) : null}
        <p className="wh-caption lc-caption" id={`${ids}-name-hint`}>
          현관 QR을 연 사람이 가장 먼저 보는 이름이에요. 바꿀 수 있어요.
        </p>

        <p className="wh-field-label lc-label lc-label--address">
          주소<span className="lc-label__opt">월계함 팀이 확인한 주소</span>
        </p>
        <p className="lc-lock">
          <Icon name="lock" />
          <span>{building.fullAddress}</span>
          <span className="wh-visually-hidden">(바꿀 수 없어요)</span>
        </p>
        <p className="wh-caption lc-caption">
          공개 화면에는 ‘{building.displayAddress}’까지만 보여요.
        </p>

        {contact ? (
          <a className="lc-ask" href={contact} target="_blank" rel="noopener noreferrer">
            <Icon name="circle-help" />
            <span className="lc-ask__text">주소가 다르거나 건물이 여러 개예요</span>
            <b className="lc-ask__action">팀에 알리기</b>
          </a>
        ) : null}
      </div>
    </Screen>
  );
}
