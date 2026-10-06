import { createHash, randomBytes } from "node:crypto";
import type { OccupancyStatus } from "@wolgyeham/contracts";
import { and, eq, gt, ne } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { buildingManagers, occupancies, sessions } from "../db/schema.ts";
import type { AppEnv, SessionUser } from "./context.ts";
import type { Database } from "./db.ts";
import type { Env } from "./env.ts";
import { AppError } from "./errors.ts";
import { occupancyState } from "./reconfirm.ts";

export const SESSION_COOKIE = "wh_session";
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 30;
/** 쓰면서 연장해도 로그인한 날부터 이 기간이 지나면 끝납니다. */
const SESSION_MAX_DAYS = 90;

/** 32바이트 난수 토큰(base64url). 세션·초대 토큰에 씁니다. */
export function createToken(): string {
  return randomBytes(32).toString("base64url");
}

/** DB에는 토큰 원문 대신 SHA-256 해시(hex)만 저장합니다. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isSecureOrigin(env: Env): boolean {
  return env.APP_ORIGIN.startsWith("https://");
}

/**
 * 우리 화면(`APP_ORIGIN`)에서 시작한 요청인지. 브라우저가 `Sec-Fetch-Site`를 보냈으면 `same-origin`일 때만 참이고,
 * 보내지 않았으면(오래된 브라우저, https가 아닌 주소) `Origin`(없으면 `Referer`)의 출처가 `APP_ORIGIN`과 같을 때만
 * 참입니다. 다른 사이트의 링크·폼으로 들어온 요청이 사용자 대신 약관 동의를 남기지 못하게 합니다.
 */
export function isSameOriginRequest(c: Context<AppEnv>): boolean {
  const site = c.req.header("Sec-Fetch-Site");
  if (site !== undefined) return site === "same-origin";
  const source = c.req.header("Origin") ?? c.req.header("Referer");
  if (!source) return false;
  try {
    return new URL(source).origin === c.var.env.APP_ORIGIN;
  } catch {
    return false;
  }
}

function setSessionCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: isSecureOrigin(c.var.env),
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** 요청에 있던 세션은 먼저 끝내고 새 세션을 만듭니다(로그인할 때마다 토큰이 바뀜). */
export async function startSession(c: Context<AppEnv>, userId: string) {
  const previous = getCookie(c, SESSION_COOKIE);
  if (previous) await c.var.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(previous)));
  const token = createToken();
  await c.var.db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS),
  });
  setSessionCookie(c, token);
}

export async function endSession(c: Context<AppEnv>) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.var.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isSecureOrigin(c.var.env) });
}

/** 쿠키가 있을 때만 세션을 조회해 `c.var.user`를 채웁니다. 연장(rolling)은 하루 한 번 이하로 씁니다. */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("user", null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const now = new Date();
    const [session] = await c.var.db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        lastSeenAt: sessions.lastSeenAt,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          gt(sessions.expiresAt, now),
          gt(sessions.createdAt, new Date(now.getTime() - SESSION_MAX_DAYS * DAY_MS)),
        ),
      )
      .limit(1);
    if (session) {
      c.set("user", { id: session.userId, sessionId: session.id });
      if (now.getTime() - session.lastSeenAt.getTime() >= DAY_MS) {
        await c.var.db
          .update(sessions)
          .set({
            lastSeenAt: now,
            expiresAt: new Date(
              Math.min(
                now.getTime() + SESSION_DAYS * DAY_MS,
                session.createdAt.getTime() + SESSION_MAX_DAYS * DAY_MS,
              ),
            ),
          })
          .where(eq(sessions.id, session.id));
        setSessionCookie(c, token);
      }
    } else {
      deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isSecureOrigin(c.var.env) });
    }
  }
  await next();
});

export function requireUser(c: Context<AppEnv>): SessionUser {
  const user = c.var.user;
  if (!user) throw new AppError(401, "UNAUTHENTICATED");
  return user;
}

export async function isManager(db: Database, userId: string, buildingId: string) {
  const [row] = await db
    .select({ id: buildingManagers.id })
    .from(buildingManagers)
    .where(and(eq(buildingManagers.userId, userId), eq(buildingManagers.buildingId, buildingId)))
    .limit(1);
  return row !== undefined;
}

/** `buildingId`는 요청 경로가 아니라 대상 자원에서 꺼낸 값을 넘깁니다. */
export async function requireManager(db: Database, userId: string, buildingId: string) {
  if (!(await isManager(db, userId, buildingId))) throw new AppError(403, "NOT_BUILDING_MANAGER");
}

/** 사용자의 살아 있는 연결(active·reconfirm_needed). 사용자마다 하나뿐입니다. */
export async function findLiveOccupancy(db: Database, userId: string) {
  const [row] = await db
    .select()
    .from(occupancies)
    .where(and(eq(occupancies.userId, userId), ne(occupancies.status, "inactive")))
    .limit(1);
  return row;
}

/**
 * 이 건물과의 연결 상태가 `allow` 안에 있어야 통과합니다. 상태는 재확인 기한을 반영해 계산한 값입니다
 * (`lib/reconfirm.ts`). 연결이 없거나 다른 건물·`inactive`면 403 `NOT_CONNECTED`, `reconfirm_needed`인데
 * 허용하지 않으면 403 `RECONFIRM_NEEDED`입니다. `buildingId`가 null이면 건물과 관계없이 사용자의 살아 있는
 * 연결을 봅니다(푸시 구독).
 */
export async function requireOccupancy(
  db: Database,
  userId: string,
  buildingId: string | null,
  options: { allow: readonly OccupancyStatus[] } = { allow: ["active"] },
) {
  const occupancy = await findLiveOccupancy(db, userId);
  if (!occupancy || (buildingId !== null && occupancy.buildingId !== buildingId)) {
    throw new AppError(403, "NOT_CONNECTED");
  }
  const { status } = occupancyState(occupancy);
  if (!options.allow.includes(status)) {
    throw new AppError(403, status === "reconfirm_needed" ? "RECONFIRM_NEEDED" : "NOT_CONNECTED");
  }
  return { ...occupancy, status };
}
