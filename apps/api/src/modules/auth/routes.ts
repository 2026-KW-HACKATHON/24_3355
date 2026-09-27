import {
  DevLoginBody,
  KakaoStartQuery,
  LOGIN_RESULT_PARAM,
  type LoginResult,
  Me,
  ReturnTo,
} from "@wolgyeham/contracts";
import { type Context, Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { describeRoute, validator } from "hono-openapi";
import { z } from "zod";
import { createToken, endSession, isSecureOrigin, startSession } from "../../lib/auth.ts";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import { log } from "../../lib/log.ts";
import * as meService from "../me/service.ts";
import * as authService from "./service.ts";

const OAUTH_COOKIE = "wh_oauth";
const OAUTH_COOKIE_PATH = "/api/auth/kakao";
const OAuthState = z.object({ state: z.string().min(1), returnTo: ReturnTo });

const KakaoCallbackQuery = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

function redirectTo(c: Context<AppEnv>, returnTo: string, result?: LoginResult) {
  const url = new URL(returnTo, c.var.env.APP_ORIGIN);
  if (result) url.searchParams.set(LOGIN_RESULT_PARAM, result);
  return c.redirect(url.toString(), 302);
}

async function readOAuthState(c: Context<AppEnv>, secret: string) {
  const raw = await getSignedCookie(c, secret, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH, secure: isSecureOrigin(c.var.env) });
  if (!raw) return undefined;
  try {
    const parsed = OAuthState.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export const authRoutes = new Hono<AppEnv>()
  .get(
    "/auth/kakao/start",
    describeRoute({
      tags: ["auth"],
      summary: "카카오 로그인 시작. state 쿠키를 만들고 카카오 인가 주소로 302",
      responses: {
        302: { description: "카카오 인가 주소로 이동" },
        ...errorResponses(400, 503),
      },
    }),
    validator("query", KakaoStartQuery, onInvalid),
    async (c) => {
      const config = authService.kakaoConfig(c.var.env);
      const { returnTo = "/" } = c.req.valid("query");
      const state = createToken();
      await setSignedCookie(
        c,
        OAUTH_COOKIE,
        JSON.stringify({ state, returnTo }),
        config.stateSecret,
        {
          httpOnly: true,
          sameSite: "Lax",
          path: OAUTH_COOKIE_PATH,
          secure: isSecureOrigin(c.var.env),
          maxAge: 10 * 60,
        },
      );
      return c.redirect(authService.kakaoAuthorizeUrl(config, state), 302);
    },
  )
  .get(
    "/auth/kakao/callback",
    describeRoute({
      tags: ["auth"],
      summary:
        "카카오 로그인 콜백. 세션을 만들고 returnTo로 302 (실패·취소면 ?login=failed|cancelled)",
      responses: {
        302: { description: "returnTo로 이동" },
        ...errorResponses(400, 503),
      },
    }),
    validator("query", KakaoCallbackQuery, onInvalid),
    async (c) => {
      const config = authService.kakaoConfig(c.var.env);
      const query = c.req.valid("query");
      const saved = await readOAuthState(c, config.stateSecret);
      if (!saved) return redirectTo(c, "/", "failed");
      if (query.error) {
        return redirectTo(
          c,
          saved.returnTo,
          query.error === "access_denied" ? "cancelled" : "failed",
        );
      }
      if (!query.code || query.state !== saved.state) {
        return redirectTo(c, saved.returnTo, "failed");
      }
      let kakaoUserId: string;
      try {
        kakaoUserId = await authService.fetchKakaoUserId(config, query.code);
      } catch (error) {
        log("warn", "kakao_login_failed", {
          requestId: c.var.requestId,
          stage: error instanceof authService.KakaoLoginError ? error.stage : "network",
          status: error instanceof authService.KakaoLoginError ? error.status : undefined,
        });
        return redirectTo(c, saved.returnTo, "failed");
      }
      const userId = await authService.loginKakaoUser(c.var.db, kakaoUserId);
      await startSession(c, userId);
      return redirectTo(c, saved.returnTo);
    },
  )
  .post(
    "/auth/logout",
    describeRoute({
      tags: ["auth"],
      summary: "로그아웃. 세션 행과 쿠키를 지움 (로그인하지 않았어도 204)",
      responses: { 204: { description: "로그아웃됨" } },
    }),
    async (c) => {
      await endSession(c);
      return c.body(null, 204);
    },
  );

/** 시연 모드(DEMO_MODE=true)에서만 app.ts가 붙입니다. 꺼져 있으면 경로가 없어 404입니다. */
export const devRoutes = new Hono<AppEnv>()
  .get(
    "/dev/login",
    describeRoute({
      tags: ["dev"],
      summary: "시연 로그인을 쓸 수 있는지 확인 (DEMO_MODE 전용, 부작용 없음)",
      responses: {
        204: { description: "시연 로그인 가능" },
        ...errorResponses(404),
      },
    }),
    async (c) => {
      await authService.findDemoUser(c.var.db, "demo-landlord");
      return c.body(null, 204);
    },
  )
  .post(
    "/dev/login",
    describeRoute({
      tags: ["dev"],
      summary: "시드된 시연 사용자로 로그인 (DEMO_MODE 전용)",
      responses: { 200: jsonResponse("시연 사용자", Me), ...errorResponses(400, 404) },
    }),
    validator("json", DevLoginBody, onInvalid),
    async (c) => {
      const userId = await authService.findDemoUser(c.var.db, c.req.valid("json").as);
      await startSession(c, userId);
      return c.json(await meService.getMe(c.var.db, userId), 200);
    },
  );
