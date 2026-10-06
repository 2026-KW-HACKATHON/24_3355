// LF-02 기본 안내 상세 · lofi 11 14, 메모 시트 12·13, 연결 필요 44. 재확인 필요면 읽기만(40으로 확인)
import { ActionButton, Skeleton } from "@seed-design/react";
import type { Guide } from "@wolgyeham/contracts";
import { type ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";
import { useAutoSheetTurn } from "../../components/autoSheet";
import { Icon } from "../../components/Icon";
import { BackButton, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError, SkeletonLines } from "../../components/ScreenState";
import { useMe } from "../../features/auth/queries";
import { CATEGORY } from "../../features/guides/categories";
import { GuideBody } from "../../features/guides/GuideBody";
import {
  clearMemoDraft,
  MEMO_PARAM,
  MEMO_WRITE,
  memoReturnAction,
  takeMemoDraft,
} from "../../features/guides/memoDraft";
import { memoAccess, useGuideMemos } from "../../features/guides/memos";
import { useGuide } from "../../features/guides/queries";
import { readConnectedState } from "../../features/occupancy/connectedState";
import { MoveOutSheet } from "../../features/occupancy/MoveOutSheet";
import { ReconfirmSheet } from "../../features/occupancy/ReconfirmSheet";
import { toAppError } from "../../lib/errors";
import { useSpeech } from "../../lib/speech";
import { ConnectNeededSheet } from "./ConnectNeededSheet";
import { MemoList } from "./MemoList";
import { MemoSheet } from "./MemoSheet";
import "./guide-detail.css";

export function Component() {
  const { buildingId = "", guideId = "" } = useParams();
  const guide = useGuide(guideId);
  const home = `/b/${buildingId}`;

  if (guide.isError) {
    const { code } = toAppError(guide.error);
    if (code === "NOT_FOUND" || code === "VALIDATION_FAILED") return <GuideMissing home={home} />;
    return (
      <DetailShell home={home}>
        <LoadError onRetry={() => void guide.refetch()} retrying={guide.isFetching} />
      </DetailShell>
    );
  }

  if (guide.isPending) {
    return (
      <DetailShell home={home} busy>
        <Delayed label="안내를 불러오는 중">
          <div className="wh-pad gd-skeleton">
            <Skeleton radius="8" height="24px" width="30%" />
            <Skeleton radius="8" height="32px" width="85%" />
            <SkeletonLines lines={4} />
          </div>
        </Delayed>
      </DetailShell>
    );
  }

  // 공개 화면은 공개된 안내만 보여줍니다. 집주인이 받는 초안도 여기서는 없는 안내로 봅니다.
  if (guide.data.status !== "published") return <GuideMissing home={home} />;
  // 다른 건물 주소로 열렸으면 안내가 속한 건물 주소로 바꿉니다.
  if (guide.data.buildingId !== buildingId) {
    return <Navigate replace to={`/b/${guide.data.buildingId}/guides/${guide.data.id}`} />;
  }
  return <GuideDetail guide={guide.data} home={home} />;
}

function DetailShell({
  home,
  busy = false,
  children,
}: {
  home: string;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      topbar={<TopBar start={<BackButton fallback={home} />} title="건물 안내" />}
    >
      {children}
    </Screen>
  );
}

type Sheet = "memo" | "connect" | "reconfirm" | "moveOut";

function GuideDetail({ guide, home }: { guide: Guide; home: string }) {
  const speech = useSpeech();
  const label = CATEGORY[guide.category].label;
  const location = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  // /api/me를 불러오지 못했으면(연결 문제) 거주자인지 모릅니다. 연결 안내(44)를 띄우거나 쓰던 메모를 지우지 않고
  // 메모 자리에 다시 시도를 둡니다(리뷰 M2).
  const meFailed = me.isError && me.data === undefined;
  const { resident, manager, reconfirm, canWrite } = memoAccess(me.data, guide.buildingId);
  const memos = useGuideMemos(guide.id, Boolean(resident));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [memoStart, setMemoStart] = useState("");
  // `?memo=write`로 돌아와 저절로 연 메모 시트는 다른 자동 시트(약관 등)와 차례를 맞춥니다.
  const [autoMemo, setAutoMemo] = useState(false);
  const memoTurn = useAutoSheetTurn("memo-return", autoMemo && sheet === "memo");

  // 연결(44)이나 다시 로그인을 마치고 `?memo=write`로 돌아오면 메모 시트를 엽니다. 내용은 보내지 않습니다.
  // 연결 직후라 알림 선택(17)이 떠 있으면 그 시트를 닫은 뒤에 엽니다.
  const wantsWrite = new URLSearchParams(location.search).get(MEMO_PARAM) === MEMO_WRITE;
  const connected = readConnectedState(location.state);
  const notifyPending = connected?.first === true && connected.notifyAsked !== true;
  const meKnown = !me.isPending && !meFailed;
  useEffect(() => {
    const action = memoReturnAction({ wantsWrite, meKnown, notifyPending, canWrite });
    if (action === "none" || action === "wait") return;
    const params = new URLSearchParams(location.search);
    params.delete(MEMO_PARAM);
    const search = params.toString();
    void navigate(
      { pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash },
      { replace: true, state: location.state, preventScrollReset: true },
    );
    if (action === "open") {
      setMemoStart(takeMemoDraft(guide.id) ?? "");
      setSheet("memo");
      setAutoMemo(true);
    } else {
      clearMemoDraft();
    }
  }, [wantsWrite, meKnown, notifyPending, canWrite, guide.id, location, navigate]);

  function toggleSpeech() {
    if (speech.speaking) speech.stop();
    else speech.speak(`${guide.title}.\n${guide.body}`);
  }

  function openMemo() {
    if (meFailed) {
      void me.refetch();
      return;
    }
    if (canWrite) {
      setMemoStart("");
      setSheet("memo");
    } else {
      setSheet("connect");
    }
  }

  const closeSheet = (open: boolean) => {
    if (open) return;
    setSheet(null);
    setAutoMemo(false);
  };

  return (
    <Screen
      topbar={
        <TopBar
          start={<BackButton fallback={home} />}
          title="건물 안내"
          end={
            <button
              type="button"
              className="wh-icon-btn wh-icon-btn--primary"
              aria-label={speech.speaking ? "읽어주기 멈추기" : "읽어주기"}
              aria-pressed={speech.speaking}
              aria-describedby={speech.supported ? undefined : "gd-tts-unsupported"}
              disabled={!speech.supported}
              onClick={toggleSpeech}
            >
              <Icon name="volume-2" />
            </button>
          }
        />
      }
    >
      <div aria-live="polite">
        {speech.speaking ? (
          <div className="gd-tts">
            <span className="gd-tts__wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="gd-tts__text">‘{label}’ 안내를 읽고 있어요</span>
            <button type="button" className="gd-tts__stop" onClick={speech.stop}>
              <span className="gd-tts__stop-face">
                <Icon name="square" />
                멈추기
              </span>
            </button>
          </div>
        ) : null}
      </div>
      {speech.supported ? null : (
        <p className="gd-tts-off" id="gd-tts-unsupported">
          <Icon name="volume-2" />이 브라우저에서는 읽어주기를 쓸 수 없어요
        </p>
      )}

      <article className="wh-pad gd-article">
        <GuideBody guide={guide} caption="updated" />
      </article>

      <div className="wh-pad">
        {manager ? (
          <div className="gd-memo">
            <div className="gd-memo__text">
              <p className="gd-memo__title">이 안내를 고치려면</p>
              <p className="gd-memo__sub">관리 화면에서 고친 뒤 ‘수정 공개’를 눌러요</p>
            </div>
            <ActionButton
              asChild
              className="wh-btn wh-btn--secondary wh-btn--sm"
              size="large"
              variant="neutralWeak"
            >
              <Link to={`/manage/${guide.buildingId}/guides/${guide.id}/edit`}>안내 고치기</Link>
            </ActionButton>
          </div>
        ) : resident && reconfirm === "needed" ? (
          <div className="gd-memo gd-memo--hold" role="note">
            <div className="gd-memo__text">
              <p className="gd-memo__title">거주 확인이 필요해요</p>
              <p className="gd-memo__sub">
                확인하기 전까지 새 메모를 남길 수 없어요. 안내와 남긴 메모는 계속 볼 수 있어요.
              </p>
            </div>
            <ActionButton
              className="wh-btn wh-btn--secondary wh-btn--sm"
              size="large"
              variant="neutralWeak"
              onClick={() => setSheet("reconfirm")}
            >
              거주 확인
            </ActionButton>
          </div>
        ) : meFailed ? (
          <div className="gd-memo" role="status">
            <div className="gd-memo__text">
              <p className="gd-memo__title">안내가 달라졌나요?</p>
              <p className="gd-memo__sub">내 정보를 불러오지 못했어요</p>
            </div>
            <ActionButton
              className="wh-btn wh-btn--secondary wh-btn--sm"
              size="large"
              variant="neutralWeak"
              loading={me.isFetching}
              disabled={me.isFetching}
              onClick={openMemo}
            >
              다시 시도
            </ActionButton>
          </div>
        ) : (
          <div className="gd-memo">
            <div className="gd-memo__text">
              <p className="gd-memo__title">안내가 달라졌나요?</p>
              <p className="gd-memo__sub">집주인이 확인하고 반영할 수 있어요</p>
            </div>
            <ActionButton
              className="wh-btn wh-btn--secondary wh-btn--sm"
              size="large"
              variant="neutralWeak"
              loading={me.isPending}
              disabled={me.isPending}
              onClick={openMemo}
            >
              메모 남기기
            </ActionButton>
          </div>
        )}

        {resident ? (
          <MemoList
            memos={memos.data}
            failed={memos.isError}
            retrying={memos.isFetching}
            onRetry={() => void memos.refetch()}
          />
        ) : null}
      </div>

      <ConnectNeededSheet
        open={sheet === "connect"}
        onOpenChange={closeSheet}
        buildingId={guide.buildingId}
        guideId={guide.id}
        label={label}
      />
      {resident ? (
        <>
          <MemoSheet
            open={sheet === "memo" && (!autoMemo || memoTurn)}
            onOpenChange={closeSheet}
            buildingId={guide.buildingId}
            guideId={guide.id}
            label={label}
            initialBody={memoStart}
          />
          <ReconfirmSheet
            open={sheet === "reconfirm"}
            onOpenChange={closeSheet}
            occupancy={resident}
            onMoveOut={() => setSheet("moveOut")}
          />
          <MoveOutSheet open={sheet === "moveOut"} onOpenChange={closeSheet} occupancy={resident} />
        </>
      ) : null}
    </Screen>
  );
}

function GuideMissing({ home }: { home: string }) {
  return (
    <DetailShell home={home}>
      <div className="wh-pad gd-missing">
        <EmptyState
          icon="file-text"
          title="이 안내를 찾을 수 없어요"
          description="집주인이 안내를 내렸거나 주소가 바뀌었을 수 있어요."
        >
          <ActionButton
            asChild
            className="wh-btn wh-btn--secondary wh-btn--sm gd-missing__home"
            size="large"
            variant="neutralWeak"
          >
            <Link to={home}>건물 안내 전체 보기</Link>
          </ActionButton>
        </EmptyState>
      </div>
    </DetailShell>
  );
}
