import { ActionButton, BottomSheet, Portal, Skeleton } from "@seed-design/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Hami } from "../../components/Hami";
import { Icon, type IconName } from "../../components/Icon";
import { useToast } from "../../components/useToast";
import { AppError, errorMessage } from "../../lib/errors";
import type { PushEnv } from "../../lib/pushEnv";
import { copyText } from "../../lib/share";
import { kakaoOpenExternalUrl, notifyLinkUrl } from "./notifyLink";
import { disablePush, enablePush, loadSavedPush, resaveSubscription } from "./push";
import { usePushEnv } from "./queries";
import "./notify-choice.css";

// LF-04 연결 뒤 알림 선택 · lofi 17, 환경별 분기는 screens.md §6. 내 정보(45)의 ‘공지 알림’도 같은 시트를 엽니다.
// 알림을 켜지 않아도 연결은 끝난 상태이고, 이 시트는 한 번만 먼저 보여줍니다.

export type NotifyContext = "connected" | "settings";

type Step = { text: string; icon: IconName };

function Steps({ steps }: { steps: readonly Step[] }) {
  return (
    <ol className="wh-steps-box">
      {steps.map((step, index) => (
        <li key={step.text}>
          <span className="wh-steps-box__num">{index + 1}</span>
          {step.text}
          <Icon name={step.icon} />
        </li>
      ))}
    </ol>
  );
}

export type NotifyActions = {
  /** 알림 켜기·끄기를 처리하는 중(누른 버튼에 로딩 표시). */
  busy: boolean;
  /** 서버에 저장·삭제하는 중이라 닫을 수 없음. 권한 창을 기다리는 동안은 닫을 수 있습니다. */
  closeLocked?: boolean;
  error: string | undefined;
  onEnable: () => void;
  onDisable: () => void;
  onOpenExternal: () => void;
  onCopyLink: () => void;
  onClose: () => void;
};

/** 시트 본문. 환경(`env`)마다 제목·설명·다음 행동이 다릅니다. SEED 없이도 그려 테스트합니다. */
export function NotifyChoiceBody({
  env,
  context,
  actions,
  renderTitle = (text) => <h2 className="wh-sheet__title">{text}</h2>,
}: {
  env: PushEnv | undefined;
  context: NotifyContext;
  actions: NotifyActions;
  renderTitle?: (text: string) => ReactNode;
}) {
  const close = (label: string, variant: "primary" | "neutral" = "primary") => (
    <ActionButton
      className={variant === "primary" ? "wh-btn" : "wh-btn wh-btn--neutral"}
      size="large"
      variant={variant === "primary" ? "brandSolid" : "neutralWeak"}
      disabled={actions.closeLocked === true}
      onClick={actions.onClose}
    >
      {label}
    </ActionButton>
  );

  let title: string;
  let lead: string | undefined;
  let extra: ReactNode = null;
  let buttons: ReactNode;

  if (!env) {
    // 공개키·구독 확인이 끝나기 전에는 누를 수 없는 ‘알림 받기’ 대신 자리만 보여줍니다.
    title = "알림 환경을 확인하는 중이에요";
    buttons = (
      <>
        <div role="status" aria-label="알림 환경을 확인하는 중">
          <Skeleton radius="16" height="56px" />
        </div>
        {close("닫기", "neutral")}
      </>
    );
  } else if (env.kind === "available") {
    title = "새 공지를 알림으로 받을까요?";
    lead = "공지가 올라오면 이 휴대폰으로 알려 드려요.\n알림은 언제든 내 정보에서 끌 수 있어요.";
    buttons = (
      <>
        <ActionButton
          className="wh-btn"
          size="large"
          loading={actions.busy}
          disabled={actions.busy}
          onClick={actions.onEnable}
        >
          <Icon name="bell" />
          알림 받기
        </ActionButton>
        {close("나중에", "neutral")}
      </>
    );
  } else if (env.kind === "enabled") {
    title = "공지 알림이 켜져 있어요";
    lead = "새 공지가 올라오면 이 휴대폰으로 알려 드려요.";
    buttons =
      context === "settings" ? (
        <>
          {close("닫기")}
          <ActionButton
            className="wh-btn wh-btn--neutral"
            size="large"
            variant="neutralWeak"
            loading={actions.busy}
            disabled={actions.busy}
            onClick={actions.onDisable}
          >
            이 휴대폰에서 알림 끄기
          </ActionButton>
        </>
      ) : (
        close("알겠어요")
      );
  } else if (env.kind === "ios-install") {
    title = "새 공지를 알림으로 받으려면";
    lead = "iPhone은 월계함을 홈 화면에 추가한 뒤\n알림을 켤 수 있어요.";
    extra = (
      <>
        <Steps
          steps={[
            { text: env.safari ? "아래 공유 버튼 누르기" : "공유 버튼 누르기", icon: "share" },
            { text: "‘홈 화면에 추가’ 고르기", icon: "square-plus" },
            { text: "홈 화면의 월계함에서 ‘알림 받기’", icon: "bell" },
          ]}
        />
        <p className="wh-note ns-note">
          <Icon name="info" />
          <span>카카오톡 안에서 열었다면 먼저 ‘Safari로 열기’를 눌러 주세요.</span>
        </p>
      </>
    );
    buttons = close("알겠어요");
  } else if (env.kind === "in-app") {
    const kakao = env.app === "kakao";
    title = kakao ? "카카오톡 안에서는 알림을 켤 수 없어요" : "이 앱 안에서는 알림을 켤 수 없어요";
    lead =
      "Safari나 Chrome에서 월계함 내 정보를 열고\n로그인하면 알림을 켤 수 있어요. 연결은 그대로예요.";
    buttons = (
      <>
        {kakao ? (
          <ActionButton
            className="wh-btn"
            size="large"
            disabled={actions.busy}
            onClick={actions.onOpenExternal}
          >
            <Icon name="external-link" />
            Safari·Chrome으로 열기
          </ActionButton>
        ) : null}
        <ActionButton
          className={kakao ? "wh-btn wh-btn--neutral" : "wh-btn"}
          size="large"
          variant={kakao ? "neutralWeak" : "brandSolid"}
          disabled={actions.busy}
          onClick={actions.onCopyLink}
        >
          <Icon name="copy" />
          주소 복사
        </ActionButton>
        {close("나중에", "neutral")}
      </>
    );
  } else if (env.kind === "blocked") {
    title = "지금 알림이 꺼져 있어요";
    lead =
      "이 브라우저에서 월계함 알림을 막아 두었어요.\n설정에서 허용하면 새 공지를 받을 수 있어요.";
    extra = (
      <Steps
        steps={
          env.ios
            ? [
                { text: "iPhone ‘설정’ 열기", icon: "settings" },
                { text: "‘알림’에서 월계함 고르기", icon: "bell" },
                { text: "‘알림 허용’ 켜기", icon: "check" },
              ]
            : [
                { text: "주소창 왼쪽 아이콘 누르기", icon: "lock" },
                { text: "‘권한’ 또는 ‘알림’ 고르기", icon: "settings" },
                { text: "‘허용’으로 바꾸고 새로고침", icon: "rotate-cw" },
              ]
        }
      />
    );
    buttons = close("알겠어요");
  } else {
    title = "공지는 우리 건물 화면에서 볼 수 있어요";
    lead =
      env.reason === "server"
        ? "지금은 월계함이 알림을 보내지 않고 있어요.\n새 공지는 건물 화면과 집주인이 보내는 링크로 확인해요."
        : "이 브라우저는 알림을 지원하지 않아요.\n새 공지는 건물 화면과 집주인이 보내는 링크로 확인해요.";
    buttons = close("알겠어요");
  }

  return (
    <div className="ns-body">
      <div className="wh-sheet__hami">
        <Hami pose="bell" size={112} eager />
      </div>
      {renderTitle(title)}
      {lead ? <p className="wh-sheet__lead">{lead}</p> : null}
      {extra}
      {actions.error ? (
        <p className="wh-dock__error ns-error" role="alert">
          {actions.error}
        </p>
      ) : null}
      <div className="wh-sheet__actions">{buttons}</div>
      {context === "connected" ? (
        <p className="wh-sheet__caption">
          연결은 끝났어요. 알림 없이도 공지는 우리 건물 화면에서 볼 수 있어요.
        </p>
      ) : null}
    </div>
  );
}

function pushErrorMessage(error: AppError): string {
  if (error.code === "NOT_CONNECTED" || error.code === "RECONFIRM_NEEDED") {
    return "이 건물에 연결된 거주자만 공지 알림을 켤 수 있어요";
  }
  if (error.code === "UNAUTHENTICATED")
    return "로그인이 끝나서 알림을 켜지 못했어요. 다시 로그인해 주세요";
  return `알림을 켜지 못했어요. ${errorMessage(error)}`;
}

function permissionGranted(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

/**
 * 누른 버튼 없이 뜬 시트를 닫은 뒤 포커스가 갈 곳이 없으면(body·지운 요소·닫힌 시트 안) 화면 제목으로
 * 돌려놓습니다. 사용자가 그새 다른 곳을 눌렀으면 두고 갑니다.
 */
function focusPageHeading() {
  const active = document.activeElement;
  const free =
    !active ||
    active === document.body ||
    !active.isConnected ||
    active.closest('[role="dialog"]') !== null;
  if (!free) return;
  const target =
    document.querySelector<HTMLElement>("main h1, header h1") ??
    document.querySelector<HTMLElement>("main");
  target?.focus({ preventScroll: true });
}

type Phase = "idle" | "asking" | "saving";

/** 알림 선택 시트(17). 닫으면 `onOpenChange(false)`. */
export function NotifyChoiceSheet({
  open,
  onOpenChange,
  context,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: NotifyContext;
}) {
  const toast = useToast();
  const push = usePushEnv(open);
  const [phase, setPhase] = useState<Phase>("idle");
  const [resaving, setResaving] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const resaveTried = useRef(false);
  const focusAfterClose = useRef(false);

  // 내 정보에서 열었는데 브라우저 구독이 서버 저장 확인 없이 남아 있으면(저장 실패·저장소 비움)
  // 한 번 다시 저장해 봅니다. 다른 계정이 저장한 구독은 조용히 옮기지 않고 사용자가 고르게 둡니다.
  const saved = push.unconfirmed ? loadSavedPush() : undefined;
  const resaveNeeded =
    open &&
    context === "settings" &&
    push.unconfirmed &&
    push.userId !== undefined &&
    (saved === undefined || saved.userId === push.userId) &&
    permissionGranted();
  const userId = push.userId;
  const { refresh } = push;
  useEffect(() => {
    if (!open) resaveTried.current = false;
  }, [open]);
  useEffect(() => {
    if (!resaveNeeded || !userId || resaveTried.current) return;
    resaveTried.current = true;
    setResaving(true);
    resaveSubscription(userId)
      .catch((caught: unknown) => {
        setError(
          caught instanceof AppError
            ? pushErrorMessage(caught)
            : "알림 설정을 확인하지 못했어요. ‘알림 받기’를 다시 눌러 주세요",
        );
      })
      .finally(() => {
        setResaving(false);
        refresh();
      });
  }, [resaveNeeded, userId, refresh]);

  async function run(task: () => Promise<void>, first: Phase) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase(first);
    setError(undefined);
    try {
      await task();
    } finally {
      inFlight.current = false;
      setPhase("idle");
    }
  }

  function restoreFocus() {
    if (!focusAfterClose.current) return;
    focusAfterClose.current = false;
    focusPageHeading();
  }

  function close() {
    onOpenChange(false);
    if (context !== "connected") return;
    // 닫히는 애니메이션이 끝나 시트가 포커스를 놓은 뒤에 옮깁니다. 애니메이션이 없으면 잠시 뒤에.
    focusAfterClose.current = true;
    window.setTimeout(restoreFocus, 600);
  }

  const actions: NotifyActions = {
    busy: phase !== "idle",
    closeLocked: phase === "saving",
    error,
    onClose: close,
    onEnable: () => {
      const key = push.publicKey;
      if (!key) {
        push.retryKey();
        setError("알림 설정을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요");
        return;
      }
      if (!push.userId) {
        setError("로그인이 끝나서 알림을 켜지 못했어요. 다시 로그인해 주세요");
        return;
      }
      const owner = push.userId;
      void run(async () => {
        try {
          // 권한 창이 떠 있는 동안에는 ‘나중에’로 닫을 수 있고, 권한을 고른 뒤 저장하는 동안만 막습니다.
          const result = await enablePush(key, owner, () => setPhase("saving"));
          if (result === "enabled") {
            toast("공지 알림을 켰어요");
            close();
          } else if (result === "dismissed") {
            setError("알림 권한을 고르지 않았어요. 다시 누르면 한 번 더 물어봐요");
          }
        } catch (caught) {
          // 브라우저가 구독을 만들지 못한 경우(DOMException)와 서버 저장 실패(AppError)를 나눠 알립니다.
          // 서버 저장이 실패하면 브라우저 구독도 끊었으므로 ‘알림 받기’를 다시 누르면 처음부터 합니다.
          setError(
            caught instanceof AppError
              ? pushErrorMessage(caught)
              : "이 브라우저가 알림 구독을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요",
          );
        } finally {
          push.refresh();
        }
      }, "asking");
    },
    onDisable: () => {
      void run(async () => {
        try {
          await disablePush();
          toast("이 휴대폰에서 공지 알림을 껐어요");
          close();
        } catch (caught) {
          setError(`알림을 끄지 못했어요. ${errorMessage(caught)}`);
        } finally {
          push.refresh();
        }
      }, "saving");
    },
    onOpenExternal: () => {
      // 외부 브라우저는 로그인·저장소가 따로라서 내 정보(로그인 후 알림 선택 17)를 엽니다.
      window.location.href = kakaoOpenExternalUrl(notifyLinkUrl());
    },
    onCopyLink: () => {
      void copyText(notifyLinkUrl()).then((copied) => {
        if (copied) toast("주소를 복사했어요. Safari·Chrome에 붙여넣어 주세요");
        else setError("복사하지 못했어요. 주소창의 주소를 길게 눌러 복사해 주세요");
      });
    },
  };

  return (
    <BottomSheet.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(undefined);
        if (next) onOpenChange(true);
        else close();
      }}
      dismissible={phase !== "saving"}
      onAnimationEnd={(isOpen) => {
        if (!isOpen) restoreFocus();
      }}
    >
      <Portal>
        <BottomSheet.Positioner>
          <BottomSheet.Backdrop />
          <BottomSheet.Content className="ns-sheet" aria-describedby={undefined}>
            <BottomSheet.Handle />
            <BottomSheet.Body>
              <NotifyChoiceBody
                env={resaving ? undefined : push.env}
                context={context}
                actions={actions}
                renderTitle={(text) => (
                  <BottomSheet.Title className="wh-sheet__title">{text}</BottomSheet.Title>
                )}
              />
            </BottomSheet.Body>
          </BottomSheet.Content>
        </BottomSheet.Positioner>
      </Portal>
    </BottomSheet.Root>
  );
}
