import { type DevLoginBody, TERMS_VERSION } from "@wolgyeham/contracts";
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
/**
 * 사용자 정보 조회 범위(`property_keys`). 회원번호(`id`)는 항상 오므로 개인정보가 아닌 응답 필드 하나(`has_signed_up`)만
 * 고릅니다. 카카오 콘솔에 닉네임·프로필 사진·이메일 동의항목이 켜져 있어도 이 응답에는 담기지 않습니다
 * (REST API 문서 ‘사용자 정보 조회 범위 지정’).
 */
const KAKAO_USER_PROPERTY_KEYS = JSON.stringify(["has_signed_up"]);

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
/** 회원번호만 읽습니다. 응답에 다른 필드가 있어도 버립니다(zod가 모르는 키를 지움). */
const KakaoUser = z.object({ id: z.number().int() });

/**
 * 인가 코드를 토큰으로 바꾸고 회원번호만 읽습니다. 사용자 정보는 `property_keys`로 범위를 좁혀 요청하고, 카카오 토큰과
 * 응답 본문은 저장하거나 로그에 남기지 않습니다.
 */
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
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.data.access_token}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({ property_keys: KAKAO_USER_PROPERTY_KEYS }),
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

/** 내 약관 동의 상태(`/me`). `termsUpToDate`는 지금 판(`TERMS_VERSION`)에 동의했는지입니다. */
export async function getTermsConsent(db: Database, userId: string) {
  const row = await repo.findTermsConsent(db, userId);
  const termsVersion = row?.termsVersion ?? null;
  return {
    termsVersion,
    termsAgreedAt: row?.termsAgreedAt?.toISOString() ?? null,
    termsUpToDate: termsVersion === TERMS_VERSION,
  };
}

/**
 * 로그인할 때 받은 동의 판을 남깁니다. 지금 판이 아니면(배포 사이의 이전 웹) 남기지 않고 false를 돌려줍니다. 같은 판에
 * 이미 동의했으면 처음 동의한 시각을 그대로 둡니다.
 */
export async function recordLoginConsent(
  db: Database,
  userId: string,
  consent: string | undefined,
) {
  if (consent !== TERMS_VERSION) return false;
  await repo.recordTermsConsent(db, userId, consent);
  return true;
}

/** 로그인한 채로 새 판에 동의합니다(`POST /me/terms-consent`). 지금 판이 아니면 409 `CONFLICT`(웹이 이전 판을 보여줌). */
export async function agreeToTerms(db: Database, userId: string, version: string) {
  if (!(await recordLoginConsent(db, userId, version))) throw new AppError(409, "CONFLICT");
}
