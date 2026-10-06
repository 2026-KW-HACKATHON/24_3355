import {
  type DevLoginBody,
  ErrorResponse,
  LOGIN_RESULT_PARAM,
  LoginResult,
  type LogoutBody,
  Me,
} from "@wolgyeham/contracts";
import { getJson, http, postEmpty, postJson, sendJsonEmpty } from "../../lib/api";
import { fillMeTerms, tolerant } from "../../lib/apiCompat";
import { AppError, toAppError } from "../../lib/errors";
import { safeReturnTo } from "../../lib/returnTo";
import { clearUserDrafts } from "../guides/localDraft";
import { clearMemoDraft } from "../guides/memoDraft";
import { clearInviteToken } from "../invites/token";
import { clearConnectDraft } from "../occupancy/connectDraft";
import { clearTipDraft } from "../tips/tipDraft";

export { safeReturnTo };

/**
 * 카카오 로그인 시작 주소. 로그인 전에 약관 동의를 받았으면(16) 그 판을 `consent`로 함께 보내고, 서버가 콜백에서
 * 계정에 남깁니다(D-28). 동의 없이 로그인한 계정은 `/me`의 `termsUpToDate`가 false라 앱을 열 때 다시 묻습니다.
 */
export function kakaoStartUrl(returnTo: string, consent?: string): string {
  const base = `/api/auth/kakao/start?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
  return consent ? `${base}&consent=${encodeURIComponent(consent)}` : base;
}

/** 카카오 로그인을 시작합니다. 서버가 로그인을 열 수 없으면(예: 키 미설정) 이동하지 않고 오류를 돌려줍니다. */
export async function startKakaoLogin(
  returnTo: string,
  consent?: string,
): Promise<AppError | undefined> {
  const url = kakaoStartUrl(returnTo, consent);
  try {
    const response = await fetch(url, { redirect: "manual", credentials: "same-origin" });
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      window.location.assign(url);
      return undefined;
    }
    const body: unknown = await response.json().catch(() => undefined);
    const parsed = ErrorResponse.safeParse(body);
    return new AppError(parsed.success ? parsed.data.error.code : "INTERNAL_ERROR");
  } catch (error) {
    return toAppError(error);
  }
}

/** 카카오에서 돌아올 때 붙는 결과(?login=cancelled|failed). */
export function readLoginResult(search: string): LoginResult | undefined {
  const value = new URLSearchParams(search).get(LOGIN_RESULT_PARAM);
  const parsed = LoginResult.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export const LOGIN_RESULT_COPY: Readonly<Record<LoginResult, string>> = {
  cancelled: "로그인을 취소했어요. 다시 시작할 수 있어요",
  failed: "로그인하지 못했어요. 다시 시도해 주세요",
};

/** 약관 필드가 없는 이전 API의 내 정보도 받습니다(lib/apiCompat, 배포 한 번 동안). */
const MeCompat = tolerant(Me, fillMeTerms);

/** 로그인하지 않았으면 null. 401은 오류가 아니라 ‘로그인 전’ 상태입니다. */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await getJson("/api/me", MeCompat);
  } catch (error) {
    if (toAppError(error).code === "UNAUTHENTICATED") return null;
    throw error;
  }
}

/** 시연 모드(DEMO_MODE=true)에서만 서버에 있는 로그인. 없으면 false. */
export async function fetchDemoLoginAvailable(): Promise<boolean> {
  try {
    const response = await http.get("/api/dev/login", { throwHttpErrors: false });
    return response.ok;
  } catch {
    return false;
  }
}

export function demoLogin(body: DevLoginBody) {
  return postJson("/api/dev/login", body, MeCompat);
}

/** 로그인한 채로 지금 판 약관에 동의합니다. 이전 판이면 409 `CONFLICT`입니다. */
export function agreeToTerms(version: string) {
  return postJson("/api/me/terms-consent", { version }, MeCompat);
}

/**
 * 로그아웃합니다. 이 브라우저에 알림 구독이 있으면 그 주소(`pushEndpoint`)를 함께 보내 서버가 같은 요청에서 내
 * 구독을 지웁니다(contracts `LogoutBody`). 서버 응답과 상관없이 이 기기에 남은 그 사용자의 쓰던 안내, 초대 토큰,
 * 연결 중이던 가입코드, 다시 로그인하려고 남긴 메모·팁을 지웁니다.
 */
export async function logout(userId: string | undefined, pushEndpoint?: string): Promise<void> {
  try {
    if (pushEndpoint) {
      const body: LogoutBody = { pushEndpoint };
      await sendJsonEmpty("post", "/api/auth/logout", body);
    } else {
      await postEmpty("/api/auth/logout");
    }
  } finally {
    if (userId) clearUserDrafts(userId);
    clearInviteToken();
    clearConnectDraft();
    clearMemoDraft();
    clearTipDraft();
  }
}
