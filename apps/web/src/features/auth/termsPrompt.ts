// 약관 판이 바뀌었거나 동의 없이 로그인한 계정에게 앱을 열 때 한 번 다시 묻습니다(D-28). 읽기는 막지 않습니다.
import { type Me, TERMS_VERSION } from "@wolgyeham/contracts";

const KEY = "wh.termsAsked";

/** 약관을 읽는 화면과 시연 시작에서는 묻지 않습니다. */
const QUIET_PATHS = ["/terms", "/privacy", "/demo"];

function askedValue(me: Me) {
  return `${me.user.id}:${TERMS_VERSION}`;
}

/** 이번 앱 실행(탭)에서 이미 물었는지. 저장소가 막히면 묻지 않은 것으로 봅니다. */
export function wasTermsAsked(me: Me): boolean {
  try {
    return sessionStorage.getItem(KEY) === askedValue(me);
  } catch {
    return false;
  }
}

/** ‘나중에’로 닫으면 이번 실행에서는 다시 띄우지 않습니다. */
export function markTermsAsked(me: Me) {
  try {
    sessionStorage.setItem(KEY, askedValue(me));
  } catch {
    // 저장하지 못하면 다음 화면에서 한 번 더 물을 수 있습니다.
  }
}

export function shouldAskTerms(me: Me | null | undefined, pathname: string, asked: boolean) {
  if (!me || me.user.termsUpToDate || asked) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  return !QUIET_PATHS.includes(path);
}
