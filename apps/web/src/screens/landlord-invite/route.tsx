// LF-12 집주인 시작 · lofi 41 (건물 확인 23은 다음 업데이트, 공개 뒤 38은 setup-done)
import { ActionButton, Skeleton } from "@seed-design/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import { Brand, Dock, Screen, TopBar } from "../../components/Screen";
import { EmptyState, LoadError } from "../../components/ScreenState";
import { LoginActions } from "../../features/auth/LoginActions";
import { useMe } from "../../features/auth/queries";
import { CATEGORY } from "../../features/guides/categories";
import {
  clearInviteToken,
  loadInviteToken,
  readInviteHash,
  stashInviteToken,
  useAcceptInvite,
  useInvitePreview,
} from "../../features/invites/queries";
import { errorMessage, toAppError } from "../../lib/errors";
import "./landlord-invite.css";

const SAMPLE_TILES = ["recycling", "parcel", "facility", "common"] as const;
const HINT = "관리 권한은 초대받은 카카오 계정에만 생겨요";

export function Component() {
  const location = useLocation();
  const navigate = useNavigate();
  const hashToken = readInviteHash(location.hash);
  const [token] = useState(() => hashToken ?? loadInviteToken());

  // #t= 토큰은 로그인을 거치면 사라지므로 이동 전에 옮겨 두고, 주소에서는 지웁니다.
  useEffect(() => {
    if (!hashToken) return;
    stashInviteToken(hashToken);
    void navigate({ pathname: location.pathname, search: location.search }, { replace: true });
  }, [hashToken, location.pathname, location.search, navigate]);

  const me = useMe();
  const preview = useInvitePreview(token);

  if (!token) {
    return (
      <InviteState
        icon="link"
        title="초대 링크를 다시 열어 주세요"
        description={"월계함 팀이 보낸 초대 링크를 눌러야\n건물 관리를 시작할 수 있어요."}
        manageId={me.data?.managedBuildings[0]?.id}
      />
    );
  }

  if (preview.isError) {
    const { code } = toAppError(preview.error);
    if (code === "INVITE_EXPIRED") {
      return (
        <InviteState
          icon="clock"
          title="초대 링크의 기간이 지났어요"
          description="월계함 팀에 새 링크를 요청해 주세요."
          manageId={me.data?.managedBuildings[0]?.id}
        />
      );
    }
    if (code === "NOT_FOUND" || code === "VALIDATION_FAILED") {
      return (
        <InviteState
          icon="link"
          title="이미 수락했거나 찾을 수 없는 초대예요"
          description={
            "이미 수락했다면 관리 홈에서 이어서 할 수 있어요.\n링크를 끝까지 복사했는지도 확인해 주세요."
          }
          manageId={me.data?.managedBuildings[0]?.id}
        />
      );
    }
    return (
      <InviteShell>
        <LoadError onRetry={() => void preview.refetch()} retrying={preview.isFetching} />
      </InviteShell>
    );
  }

  const buildingName = preview.data?.buildingName;
  return (
    <InviteShell
      dock={
        me.isPending ? (
          <Dock hint={HINT}>
            <ActionButton className="wh-btn" size="large" loading disabled>
              확인하는 중
            </ActionButton>
          </Dock>
        ) : me.data ? (
          <AcceptDock token={token} />
        ) : (
          <LoginActions returnTo="/invite" hint={HINT} />
        )
      }
    >
      <div className="wh-pad">
        <div className="li-invite">
          <span className="li-invite__ic">
            <Icon name="building-2" />
          </span>
          <div className="li-invite__text">
            {buildingName ? (
              <p className="li-invite__title">{buildingName} 관리자로 초대받았어요</p>
            ) : (
              <Skeleton radius="8" height="20px" width="70%" />
            )}
            <p className="li-invite__sub">월계함 팀이 확인한 건물이에요</p>
          </div>
        </div>

        <h1 className="wh-h-title li-title" tabIndex={-1}>
          새 세입자에게 보내던 안내를
          <br />
          한곳에 정리하세요
        </h1>
        <p className="wh-body li-lead">
          지금 카톡으로 보내는 내용을 옮겨 두면 다음 입주자도 같은 안내를 볼 수 있어요. 카톡은 계속
          쓰셔도 돼요.
        </p>

        <figure className="li-mini" aria-label="세입자가 보는 화면 예시">
          <figcaption className="li-mini__cap">세입자는 현관 QR로 이렇게 봐요</figcaption>
          <p className="li-mini__name">{buildingName ?? "우리 건물"}</p>
          <ul className="li-mini__tiles" aria-hidden="true">
            {SAMPLE_TILES.map((category) => (
              <li key={category} className="li-mini__tile">
                <span className="li-mini__ic">
                  <Icon name={CATEGORY[category].icon} />
                </span>
                {CATEGORY[category].label}
              </li>
            ))}
          </ul>
        </figure>

        <ol className="li-flow">
          <li>
            <b>1</b>카톡 문구 붙여넣기
          </li>
          <li>
            <b>2</b>공개 전에 확인
          </li>
          <li>
            <b>3</b>현관 QR·입주 카드 받기
          </li>
        </ol>
      </div>
    </InviteShell>
  );
}

function InviteShell({ dock, children }: { dock?: ReactNode; children: ReactNode }) {
  return (
    <Screen
      dock={dock}
      topbar={
        <TopBar
          start={<Brand />}
          end={<span className="wh-badge wh-badge--gray li-badge">집주인용</span>}
        />
      }
    >
      {children}
    </Screen>
  );
}

/** 로그인한 뒤: 사용자가 다시 눌러야 수락합니다(자동으로 보내지 않음, frontend.md §5). */
function AcceptDock({ token }: { token: string }) {
  const navigate = useNavigate();
  const accept = useAcceptInvite();
  const inFlight = useRef(false);

  async function handleAccept() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await accept.mutateAsync(token);
      clearInviteToken();
      void navigate(`/manage/${result.buildingId}`, { replace: true });
    } catch {
      // 오류는 아래 문구로 남깁니다.
    } finally {
      inFlight.current = false;
    }
  }

  const error = accept.error ? toAppError(accept.error) : undefined;
  const message =
    error?.code === "NOT_FOUND"
      ? "이미 수락했거나 찾을 수 없는 초대예요"
      : error
        ? errorMessage(error)
        : undefined;

  return (
    <Dock hint={HINT} error={message}>
      <ActionButton
        className="wh-btn"
        size="large"
        loading={accept.isPending}
        disabled={accept.isPending}
        onClick={handleAccept}
      >
        초대 수락하고 시작하기
      </ActionButton>
    </Dock>
  );
}

function InviteState({
  icon,
  title,
  description,
  manageId,
}: {
  icon: "link" | "clock";
  title: string;
  description: string;
  manageId: string | undefined;
}) {
  return (
    <InviteShell
      dock={
        manageId ? (
          <Dock>
            <ActionButton asChild className="wh-btn" size="large">
              <Link to={`/manage/${manageId}`}>관리 홈으로</Link>
            </ActionButton>
          </Dock>
        ) : undefined
      }
    >
      <div className="wh-pad wh-state-top">
        <EmptyState icon={icon} title={title} description={description} />
      </div>
    </InviteShell>
  );
}
