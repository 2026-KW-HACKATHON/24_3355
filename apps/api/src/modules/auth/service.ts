import type { DevLoginBody } from "@wolgyeham/contracts";
import { z } from "zod";
import type { Database } from "../../lib/db.ts";
import type { Env } from "../../lib/env.ts";
import { AppError } from "../../lib/errors.ts";
import * as repo from "./repo.ts";

// 카카오 로그인 REST API: https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api
const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAKAO_USER_URL = "https://kapi.kakao.com/v2/user/me";
const KAKAO_TIMEOUT_MS = 5000;

type KakaoConfig = {
  clientId: string;
  clientSecret: string | undefined;
  redirectUri: string;
  /** 로그인 중 쿠키(state·returnTo) 서명 키 = SESSION_SECRET */
  stateSecret: string;
};

export function kakaoConfig(env: Env): KakaoConfig {
  // parseEnv가 카카오 키가 있으면 SESSION_SECRET도 있도록 막습니다.
  if (!env.KAKAO_REST_API_KEY || !env.SESSION_SECRET) {
    throw new AppError(503, "KAKAO_NOT_CONFIGURED");
  }
  return {
    clientId: env.KAKAO_REST_API_KEY,
    clientSecret: env.KAKAO_CLIENT_SECRET,
    redirectUri: env.KAKAO_REDIRECT_URI ?? `${env.APP_ORIGIN}/api/auth/kakao/callback`,
    stateSecret: env.SESSION_SECRET,
  };
}

export function kakaoAuthorizeUrl(config: KakaoConfig, state: string) {
  const url = new URL(KAKAO_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    state,
  }).toString();
  return url.toString();
}

export class KakaoLoginError extends Error {
  readonly stage: "token" | "profile";
  readonly status: number | undefined;

  constructor(stage: "token" | "profile", status?: number) {
    super(`kakao ${stage} request failed`);
    this.name = "KakaoLoginError";
    this.stage = stage;
    this.status = status;
  }
}

const KakaoToken = z.object({ access_token: z.string().min(1) });
const KakaoUser = z.object({ id: z.number().int() });

/** 인가 코드를 토큰으로 바꾸고 회원번호만 읽습니다. 카카오 토큰은 저장하지 않습니다. */
export async function fetchKakaoUserId(config: KakaoConfig, code: string): Promise<string> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code,
  });
  if (config.clientSecret) form.set("client_secret", config.clientSecret);
  const tokenResponse = await fetch(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: form,
    signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS),
  });
  const token = KakaoToken.safeParse(tokenResponse.ok ? await tokenResponse.json() : null);
  if (!token.success) throw new KakaoLoginError("token", tokenResponse.status);

  const userResponse = await fetch(KAKAO_USER_URL, {
    headers: { Authorization: `Bearer ${token.data.access_token}` },
    signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS),
  });
  const user = KakaoUser.safeParse(userResponse.ok ? await userResponse.json() : null);
  if (!user.success) throw new KakaoLoginError("profile", userResponse.status);
  return String(user.data.id);
}

export function loginKakaoUser(db: Database, kakaoUserId: string) {
  return repo.upsertUserByKakaoId(db, kakaoUserId);
}

/** 시연 사용자는 db:seed가 만듭니다. kakao_user_id가 실제 회원번호(숫자)와 겹치지 않습니다. */
export async function findDemoUser(db: Database, as: DevLoginBody["as"]) {
  const userId = await repo.findUserIdByKakaoId(db, as);
  if (!userId) throw new AppError(404, "NOT_FOUND");
  return userId;
}
