import { ActionButton, BottomSheet, Portal } from "@seed-design/react";
import { TERMS_VERSION } from "@wolgyeham/contracts";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { useAutoSheetTurn } from "../../components/autoSheet";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/useToast";
import { TERMS_RELEASE, termsEffectiveDate } from "../../content/terms/version";
import { toAppError } from "../../lib/errors";
import { useAgreeToTerms, useMe } from "./queries";
import { markTermsAsked, shouldAskTerms, wasTermsAsked } from "./termsPrompt";
import "./terms-sheet.css";

/** 화면이 뜨며 저절로 뜨는 다른 시트(17·40·돌아온 메모)가 먼저 줄을 서도록 이만큼 기다린 뒤에 묻습니다. */
const SETTLE_MS = 800;

/**
 * 다시 동의 받기(D-28). 로그인했지만 지금 판에 동의하지 않은 계정(`me.user.termsUpToDate === false`)에게
 * 앱을 열 때 한 번 가벼운 시트로 묻습니다. ‘나중에’로 닫을 수 있고 읽기는 그대로입니다. 앱 틀(RootLayout)이 띄웁니다.
 * 저절로 뜨는 다른 시트와 겹치지 않게 차례(`useAutoSheetTurn`, 맨 뒤)를 기다립니다. ‘나중에’는 계정마다 따로 봅니다
 * (시연 로그인으로 계정을 바꾸면 새 계정에는 다시 물음).
 */
export function TermsConsentPrompt() {
  const { pathname } = useLocation();
  const me = useMe();
  const agree = useAgreeToTerms();
  const toast = useToast();
  const [dismissedFor, setDismissedFor] = useState<string>();
  const [settled, setSettled] = useState(false);
  const data = me.data;
  // 동의하면 termsUpToDate가 true가 되어 닫힙니다(시트를 지우지 않고 닫아 사라지는 움직임을 남김).
  const wants =
    Boolean(data) &&
    dismissedFor !== data?.user.id &&
    shouldAskTerms(data, pathname, data ? wasTermsAsked(data) : false);
  useEffect(() => {
    if (!wants) return;
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [wants]);
  const turn = useAutoSheetTurn("terms", wants && settled, { last: true });
  if (!data) return null;
  const open = wants && turn;
  const firstTime = data.user.termsVersion === null;
  const changes =
    !firstTime && TERMS_RELEASE.version === TERMS_VERSION ? TERMS_RELEASE.changes : [];

  function close() {
    if (agree.isPending || !data) return;
    markTermsAsked(data);
    setDismissedFor(data.user.id);
    returnFocus();
  }

  async function handleAgree() {
    if (agree.isPending || !data) return;
    try {
      await agree.mutateAsync();
      setDismissedFor(data.user.id);
      toast("약관 동의를 저장했어요");
      returnFocus();
    } catch (error) {
      // 로그인이 끝났으면 로그인 전 상태로 돌아가 시트가 사라집니다.
      if (toAppError(error).code === "UNAUTHENTICATED") void me.refetch();
    }
  }

  const code = agree.error ? toAppError(agree.error).code : undefined;
  const message =
    code === "CONFLICT"
      ? "약관이 방금 바뀌었어요. 새로고침한 뒤 다시 확인해 주세요"
      : code
        ? "저장하지 못했어요. 다시 눌러 주세요"
        : undefined;

  return (
    <BottomSheet.Root
      open={open}
      dismissible={!agree.isPending}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Portal>
        <BottomSheet.Positioner>
          <BottomSheet.Backdrop />
          <BottomSheet.Content className="wh-terms-sheet-content" aria-describedby={undefined}>
            <BottomSheet.Handle />
            <BottomSheet.Body>
              <div className="wh-terms-sheet">
                <BottomSheet.Title className="wh-sheet__title">
                  {firstTime ? "약관에 동의해 주세요" : "약관이 바뀌었어요"}
                </BottomSheet.Title>
                <p className="wh-sheet__lead">
                  {termsEffectiveDate()}부터 적용하는 서비스 이용약관과 개인정보 처리방침이에요.
                  아직 법률 검토 전 초안이에요. 동의하지 않아도 건물 안내는 그대로 볼 수 있어요.
                </p>
                {changes.length > 0 ? (
                  <div className="wh-terms-sheet__changes">
                    <p className="wh-terms-sheet__changes-title">바뀐 점</p>
                    <ul>
                      {changes.map((change) => (
                        <li key={change}>{change}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <ul className="wh-terms-sheet__links">
                  <li>
                    <Link className="wh-list-row" to="/terms">
                      <span className="wh-list-row__text">
                        <span className="wh-list-row__title">서비스 이용약관</span>
                      </span>
                      <span className="wh-list-row__value">
                        <Icon name="chevron-right" />
                      </span>
                    </Link>
                  </li>
                  <li>
                    <Link className="wh-list-row" to="/privacy">
                      <span className="wh-list-row__text">
                        <span className="wh-list-row__title">개인정보 처리방침</span>
                      </span>
                      <span className="wh-list-row__value">
                        <Icon name="chevron-right" />
                      </span>
                    </Link>
                  </li>
                </ul>
                {message ? (
                  <p className="wh-dock__error" role="alert">
                    {message}
                  </p>
                ) : null}
                <div className="wh-sheet__actions">
                  <ActionButton
                    className="wh-btn"
                    size="large"
                    loading={agree.isPending}
                    disabled={agree.isPending}
                    onClick={() => void handleAgree()}
                  >
                    동의하고 계속하기
                  </ActionButton>
                  <ActionButton
                    className="wh-btn wh-btn--neutral"
                    size="large"
                    variant="neutralWeak"
                    disabled={agree.isPending}
                    onClick={close}
                  >
                    나중에
                  </ActionButton>
                </div>
              </div>
            </BottomSheet.Body>
          </BottomSheet.Content>
        </BottomSheet.Positioner>
      </Portal>
    </BottomSheet.Root>
  );
}

/** 누른 버튼 없이 뜬 시트라서, 닫은 뒤 포커스가 갈 곳이 없으면 화면 제목으로 돌려놓습니다(interaction.md §4). */
function returnFocus() {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    document.querySelector<HTMLElement>("main h1, header h1, main")?.focus({ preventScroll: true });
  });
}
