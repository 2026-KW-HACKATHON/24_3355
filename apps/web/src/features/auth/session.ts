import {
  type DevLoginBody,
  ErrorResponse,
  LOGIN_RESULT_PARAM,
  LoginResult,
  Me,
  ReturnTo,
} from "@wolgyeham/contracts";
import { getJson, http, postJson } from "../../lib/api";
import { AppError, toAppError } from "../../lib/errors";

/** 로그인 뒤 돌아올 경로. contracts ReturnTo와 같은 규칙(`/`로 시작, `//`·`\`·`#` 없음)만 넘깁니다. */
export function safeReturnTo(path: string): string {
  const withoutLoginResult = stripLoginResult(path);
  return ReturnTo.safeParse(withoutLoginResult).success ? withoutLoginResult : "/";
}

function stripLoginResult(path: string): string {
  const [pathname = "/", query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete(LOGIN_RESULT_PARAM);
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

export function kakaoStartUrl(returnTo: string): string {
  return `/api/auth/kakao/start?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

/** 카카오 로그인을 시작합니다. 서버가 로그인을 열 수 없으면(예: 키 미설정) 이동하지 않고 오류를 돌려줍니다. */
export async function startKakaoLogin(returnTo: string): Promise<AppError | undefined> {
  const url = kakaoStartUrl(returnTo);
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

/** 로그인하지 않았으면 null. 401은 오류가 아니라 ‘로그인 전’ 상태입니다. */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await getJson("/api/me", Me);
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
  return postJson("/api/dev/login", body, Me);
}
