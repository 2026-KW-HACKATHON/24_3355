import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { buildingManagers, sessions } from "../db/schema.ts";
import type { AppEnv, SessionUser } from "./context.ts";
import type { Database } from "./db.ts";
import type { Env } from "./env.ts";
import { AppError } from "./errors.ts";

export const SESSION_COOKIE = "wh_session";
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 30;

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

function setSessionCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: isSecureOrigin(c.var.env),
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function startSession(c: Context<AppEnv>, userId: string) {
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
      .select({ id: sessions.id, userId: sessions.userId, lastSeenAt: sessions.lastSeenAt })
      .from(sessions)
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
      .limit(1);
    if (session) {
      c.set("user", { id: session.userId, sessionId: session.id });
      if (now.getTime() - session.lastSeenAt.getTime() >= DAY_MS) {
        await c.var.db
          .update(sessions)
          .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS) })
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
