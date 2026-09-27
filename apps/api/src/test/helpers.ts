import { randomUUID } from "node:crypto";
import type { BuildingStatus, GuideCategory, GuideStatus } from "@wolgyeham/contracts";
import { afterAll, beforeAll } from "vitest";
import { createApp } from "../app.ts";
import { migrateDatabase } from "../db/migrate.ts";
import {
  buildingManagers,
  buildings,
  guides,
  managerInvites,
  sessions,
  users,
} from "../db/schema.ts";
import { createToken, hashToken, SESSION_COOKIE } from "../lib/auth.ts";
import { createDatabase, type Database } from "../lib/db.ts";
import { parseEnv } from "../lib/env.ts";

/** 로컬 기본값은 pnpm db:up의 wolgyeham_test DB입니다. CI는 TEST_DATABASE_URL을 줍니다. */
export const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ??
  "postgres://wolgyeham:local-development-only@127.0.0.1:54329/wolgyeham_test";

const DAY_MS = 24 * 60 * 60 * 1000;

export function testEnv(overrides: Record<string, string> = {}) {
  return parseEnv({
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    APP_ORIGIN: "http://localhost:5173",
    SESSION_SECRET: "test-only-session-secret-0123456789abcdef",
    ...overrides,
  });
}

type TestContext = { app: ReturnType<typeof createApp>; db: Database };

/**
 * 테스트 파일마다 마이그레이션을 적용하고 풀 하나를 엽니다.
 * 테스트끼리 데이터를 나누려고 행을 지우지 않고, 테스트마다 새 건물·사용자를 만듭니다.
 */
export function useTestApp(envOverrides: Record<string, string> = {}): TestContext {
  const context = {} as TestContext;
  let close: (() => Promise<void>) | undefined;
  beforeAll(async () => {
    try {
      await migrateDatabase(TEST_DATABASE_URL);
    } catch (error) {
      throw new Error(
        "테스트 DB에 연결하지 못했습니다. `pnpm db:up` 후 " +
          "`docker compose -f infra/compose.yaml exec db createdb -U wolgyeham wolgyeham_test`로 " +
          "DB를 만들거나 TEST_DATABASE_URL을 설정하세요.",
        { cause: error },
      );
    }
    const database = createDatabase(TEST_DATABASE_URL, { max: 3 });
    close = database.close;
    context.db = database.db;
    context.app = createApp({ env: testEnv(envOverrides), db: database.db });
  });
  afterAll(async () => {
    await close?.();
  });
  return context;
}

export async function createUser(db: Database) {
  const [row] = await db
    .insert(users)
    .values({ kakaoUserId: `test-${randomUUID()}` })
    .returning({ id: users.id });
  if (!row) throw new Error("user insert failed");
  return row.id;
}

/** 세션 행을 만들고 요청에 붙일 Cookie 헤더 값을 돌려줍니다. */
export async function sessionCookie(db: Database, userId: string, expiresInMs = 30 * DAY_MS) {
  const token = createToken();
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + expiresInMs),
  });
  return `${SESSION_COOKIE}=${token}`;
}

export async function createBuilding(db: Database, status: BuildingStatus = "preparing") {
  const [row] = await db
    .insert(buildings)
    .values({
      name: "테스트빌라",
      displayAddress: "서울 노원구 월계동 OO길",
      fullAddress: "서울 노원구 월계동 000-99",
      status,
      openedAt: status === "open" ? new Date() : null,
    })
    .returning();
  if (!row) throw new Error("building insert failed");
  return row;
}

export async function addManager(db: Database, buildingId: string, userId: string) {
  await db.insert(buildingManagers).values({ buildingId, userId });
}

/** 집주인 한 명이 관리하는 건물과 그 집주인의 세션 쿠키. */
export async function createManagedBuilding(db: Database, status: BuildingStatus = "preparing") {
  const building = await createBuilding(db, status);
  const managerId = await createUser(db);
  await addManager(db, building.id, managerId);
  return { building, managerId, managerCookie: await sessionCookie(db, managerId) };
}

export async function createGuide(
  db: Database,
  buildingId: string,
  values: { status?: GuideStatus; position?: number; category?: GuideCategory } = {},
) {
  const status = values.status ?? "draft";
  const [row] = await db
    .insert(guides)
    .values({
      buildingId,
      category: values.category ?? "recycling",
      title: `${status} 안내`,
      body: "본문",
      position: values.position ?? 1,
      status,
      publishedAt: status === "published" ? new Date() : null,
    })
    .returning();
  if (!row) throw new Error("guide insert failed");
  return row;
}

export async function createInvite(
  db: Database,
  buildingId: string,
  values: { expiresInMs?: number } = {},
) {
  const token = createToken();
  await db.insert(managerInvites).values({
    buildingId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + (values.expiresInMs ?? 7 * DAY_MS)),
  });
  return token;
}

export function jsonRequest(method: string, body: unknown, cookie?: string): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  };
}

export function withCookie(cookie: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { Cookie: cookie } };
}
