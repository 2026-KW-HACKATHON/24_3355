import {
  DevLoginBody,
  DevWhoami,
  isAllowedPushEndpoint,
  KakaoStartQuery,
  LOGIN_RESULT_PARAM,
  type LoginResult,
  LogoutBody,
  Me,
  ReturnTo,
  TERMS_VERSION,
  TermsConsent,
} from "@wolgyeham/contracts";
import { type Context, Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { describeRoute, validator } from "hono-openapi";
import { z } from "zod";
import {
  createToken,
  endSession,
  isSameOriginRequest,
  isSecureOrigin,
  startSession,
} from "../../lib/auth.ts";
import { resolveClientAddress } from "../../lib/client.ts";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import { log } from "../../lib/log.ts";
import * as meService from "../me/service.ts";
import * as noticeService from "../notices/service.ts";
import * as authService from "./service.ts";

const OAUTH_COOKIE = "wh_oauth";
const OAUTH_COOKIE_PATH = "/api/auth/kakao";
/** 서명한 로그인 쿠키. `consent`는 시작할 때 받은 동의 판이고, 지금 판이면서 우리 화면에서 시작했을 때만 담습니다. */
const OAuthState = z.object({
  state: z.string().min(1),
  returnTo: ReturnTo,
  consent: TermsConsent.optional(),
});

const KakaoCallbackQuery = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

function redirectTo(c: Context<AppEnv>, returnTo: string, result?: LoginResult) {
  let url = new URL(returnTo, c.var.env.APP_ORIGIN);
  // ReturnTo 검사를 통과했더라도 다른 출처나 `//`로 시작하는 경로가 되면 첫 화면으로 보냅니다.
  if (url.origin !== c.var.env.APP_ORIGIN || url.pathname.startsWith("//")) {
    url = new URL("/", c.var.env.APP_ORIGIN);
  }
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
      summary:
        "카카오 로그인 시작. state 쿠키(returnTo, 지금 판이고 같은 출처에서 왔으면 consent)를 서명해 만들고 카카오 인가 주소로 302",
      responses: {
        302: { description: "카카오 인가 주소로 이동" },
        ...errorResponses(400, 503),
      },
    }),
    validator("query", KakaoStartQuery, onInvalid),
    async (c) => {
      const config = authService.kakaoConfig(c.var.env);
      const { returnTo = "/", consent } = c.req.valid("query");
      const state = createToken();
      // 동의는 지금 판이면서 우리 화면에서 시작한 요청일 때만 담습니다. 다른 사이트의 링크로 들어온 요청(카카오는 이미
      // 연결한 사용자를 묻지 않고 돌려보냄)이나 이전 판을 보낸 웹(배포 사이)은 로그인만 하고 동의는 남기지 않습니다.
      // 그러면 /me의 termsUpToDate가 false라 웹이 약관을 보여 주고 다시 묻습니다.
      const saved =
        consent === TERMS_VERSION && isSameOriginRequest(c)
          ? { state, returnTo, consent }
          : { state, returnTo };
      await setSignedCookie(c, OAUTH_COOKIE, JSON.stringify(saved), config.stateSecret, {
        httpOnly: true,
        sameSite: "Lax",
        path: OAUTH_COOKIE_PATH,
        secure: isSecureOrigin(c.var.env),
        maxAge: 10 * 60,
      });
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
      try {
        const userId = await authService.loginKakaoUser(c.var.db, kakaoUserId);
        // 동의 판은 서명한 쿠키에서만 읽습니다(콜백 쿼리는 믿지 않음).
        await authService.recordLoginConsent(c.var.db, userId, saved.consent);
        await startSession(c, userId);
      } catch (error) {
        log("error", "kakao_callback_failed", {
          requestId: c.var.requestId,
          stage: "session",
          name: error instanceof Error ? error.name : "unknown",
        });
        return redirectTo(c, saved.returnTo, "failed");
      }
      return redirectTo(c, saved.returnTo);
    },
  )
  .post(
    "/auth/logout",
    describeRoute({
      tags: ["auth"],
      summary:
        "로그아웃. 세션 행과 쿠키를 지움 (로그인하지 않았어도 204). 본문 pushEndpoint가 있으면 내 그 알림 구독도 지움",
      responses: { 204: { description: "로그아웃됨" }, ...errorResponses(400) },
    }),
    validator("json", LogoutBody, onInvalid),
    async (c) => {
      const { pushEndpoint } = c.req.valid("json");
      // 알려진 푸시 서비스 주소가 아니면 저장됐을 수 없으므로 지우지 않고 로그아웃만 합니다.
      if (c.var.user && pushEndpoint && isAllowedPushEndpoint(pushEndpoint)) {
        await noticeService.unsubscribe(c.var.db, c.var.user.id, pushEndpoint);
      }
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
      summary: "시드된 시연 사용자로 로그인 (DEMO_MODE 전용). consent가 지금 판이면 동의를 남김",
      responses: { 200: jsonResponse("시연 사용자", Me), ...errorResponses(400, 404) },
    }),
    validator("json", DevLoginBody, onInvalid),
    async (c) => {
      const { as, consent } = c.req.valid("json");
      const userId = await authService.findDemoUser(c.var.db, as);
      // JSON POST라 다른 사이트는 보낼 수 없습니다(JSON은 CORS 사전 요청에서, 폼 형식은 hono/csrf에서 막힘).
      await authService.recordLoginConsent(c.var.db, userId, consent);
      await startSession(c, userId);
      return c.json(await meService.getMe(c.var.db, userId), 200);
    },
  )
  .get(
    "/dev/whoami",
    describeRoute({
      tags: ["dev"],
      summary:
        "내 요청의 X-Forwarded-For와 서버가 고른 클라이언트 주소 (DEMO_MODE 전용, 로그에 남기지 않음)",
      responses: { 200: jsonResponse("요청한 사람 자신의 주소 정보", DevWhoami) },
    }),
    (c) => {
      const info = resolveClientAddress(c);
      return c.json(
        {
          forwardedFor: info.forwardedFor,
          socketAddress: info.socketAddress,
          clientAddress: info.address,
          mode: info.mode,
          originVerify: info.originVerify,
        },
        200,
      );
    },
  );
