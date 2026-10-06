import { randomUUID } from "node:crypto";
import type {
  BuildingStatus,
  CorrectionMemoStatus,
  GuideCategory,
  GuideStatus,
  OccupancyStatus,
  ReporterKind,
  ReportStatus,
  TipCategory,
} from "@wolgyeham/contracts";
import { afterAll, beforeAll } from "vitest";
import { createApp } from "../app.ts";
import { migrateDatabase } from "../db/migrate.ts";
import {
  buildingManagers,
  buildings,
  correctionMemos,
  guides,
  joinCodes,
  managerInvites,
  occupancies,
  pushSubscriptions,
  reportAccessTokens,
  reports,
  sessions,
  tips,
  users,
} from "../db/schema.ts";
import { createToken, hashToken, SESSION_COOKIE } from "../lib/auth.ts";
import { createDatabase, type Database } from "../lib/db.ts";
import { parseEnv } from "../lib/env.ts";
import type { PushSender } from "../lib/push.ts";
import { createTaskRunner, type TaskRunner } from "../lib/tasks.ts";

/** 로컬 기본값은 pnpm db:up의 wolgyeham_test DB입니다. CI는 TEST_DATABASE_URL을 줍니다. */
export const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ??
  "postgres://wolgyeham:local-development-only@127.0.0.1:54329/wolgyeham_test";

const DAY_MS = 24 * 60 * 60 * 1000;

export function testEnv(overrides: Record<string, string> = {}) {
  return parseEnv({
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    APP_ORIGIN: TEST_ORIGIN,
    SESSION_SECRET: "test-only-session-secret-0123456789abcdef",
    ...overrides,
  });
}

/** `tasks.idle()`로 응답 뒤에 도는 일(공지 푸시)이 끝나기를 기다립니다. */
type TestContext = { app: ReturnType<typeof createApp>; db: Database; tasks: TaskRunner };

/**
 * 테스트 파일마다 마이그레이션을 적용하고 풀 하나를 엽니다.
 * 테스트끼리 데이터를 나누려고 행을 지우지 않고, 테스트마다 새 건물·사용자를 만듭니다.
 */
export function useTestApp(
  envOverrides: Record<string, string> = {},
  options: { push?: PushSender } = {},
): TestContext {
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
    context.tasks = createTaskRunner();
    context.app = createApp({
      env: testEnv(envOverrides),
      db: database.db,
      tasks: context.tasks,
      ...(options.push ? { push: options.push } : {}),
    });
  });
  afterAll(async () => {
    await context.tasks?.idle();
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

/** 건물의 현재 가입코드를 정해 둡니다. */
export async function setJoinCode(db: Database, buildingId: string, code: string) {
  await db.insert(joinCodes).values({ buildingId, code });
  return code;
}

/** `nextReconfirmAt`을 과거로 두면 재확인 요청 중(14일 안)이거나 reconfirm_needed(14일 뒤)로 계산됩니다. */
export async function createOccupancy(
  db: Database,
  buildingId: string,
  userId: string,
  status: OccupancyStatus = "active",
  values: { nextReconfirmAt?: Date } = {},
) {
  const [row] = await db
    .insert(occupancies)
    .values({
      buildingId,
      userId,
      status,
      nextReconfirmAt: values.nextReconfirmAt ?? new Date(Date.now() + 180 * DAY_MS),
      endedAt: status === "inactive" ? new Date() : null,
    })
    .returning();
  if (!row) throw new Error("occupancy insert failed");
  return row;
}

/** 안내에 붙은 수정 메모. `authorUserId`가 null이면 탈퇴 등으로 작성자 연결이 끊긴 메모입니다. */
export async function createMemo(
  db: Database,
  guideId: string,
  authorUserId: string | null,
  values: { body?: string; status?: CorrectionMemoStatus; createdAt?: Date } = {},
) {
  const status = values.status ?? "pending";
  const [row] = await db
    .insert(correctionMemos)
    .values({
      guideId,
      authorUserId,
      body: values.body ?? "수거 요일이 바뀌었어요",
      status,
      keptReason: status === "kept" ? "지금 안내가 맞아요" : null,
      resolvedAt: status === "pending" ? null : new Date(),
      ...(values.createdAt ? { createdAt: values.createdAt } : {}),
    })
    .returning();
  if (!row) throw new Error("memo insert failed");
  return row;
}

/** 사용자의 브라우저 구독 하나. endpoint는 테스트마다 다릅니다. */
export async function createPushSubscription(db: Database, userId: string) {
  const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256dh: "test-p256dh", auth: "test-auth" });
  return endpoint;
}

/**
 * 건물에 온 제보(직접 적기). `status`를 received가 아닌 값으로 주면 확인·처리 시각을 채웁니다.
 * `reporterUserId`가 null이면 비회원이 보낸 제보입니다.
 */
export async function createReport(
  db: Database,
  buildingId: string,
  values: {
    reporterUserId?: string | null;
    reporterKind?: ReporterKind;
    status?: ReportStatus;
    body?: string;
    createdAt?: Date;
  } = {},
) {
  const status = values.status ?? "received";
  const [row] = await db
    .insert(reports)
    .values({
      buildingId,
      reporterUserId: values.reporterUserId ?? null,
      reporterKind: values.reporterKind ?? "guest",
      kind: "trash",
      body: values.body ?? "분리수거함 뚜껑이 부서졌어요",
      status,
      acknowledgedAt: status === "received" ? null : new Date(),
      resolvedAt: status === "completed" || status === "unable" ? new Date() : null,
      resultNote: status === "unable" ? "다음 주에 고칠게요" : null,
      ...(values.createdAt ? { createdAt: values.createdAt } : {}),
    })
    .returning();
  if (!row) throw new Error("report insert failed");
  return row;
}

/** 제보의 비회원 조회 토큰(원문)을 만듭니다. DB에는 해시만 들어갑니다. */
export async function createReportToken(
  db: Database,
  reportId: string,
  values: { expiresInMs?: number } = {},
) {
  const token = createToken();
  await db.insert(reportAccessTokens).values({
    reportId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + (values.expiresInMs ?? 30 * DAY_MS)),
  });
  return token;
}

/** 건물의 생활 팁. `authorUserId`가 null이면 작성자 연결이 끊긴 팁, `hidden`이면 운영팀이 가린 팁입니다. */
export async function createTip(
  db: Database,
  buildingId: string,
  authorUserId: string | null,
  values: { category?: TipCategory; body?: string; hidden?: boolean; createdAt?: Date } = {},
) {
  const [row] = await db
    .insert(tips)
    .values({
      buildingId,
      authorUserId,
      category: values.category ?? "parcel",
      body: values.body ?? "비 오는 날 택배는 현관 안쪽 선반에 올려 두면 젖지 않아요.",
      hiddenAt: values.hidden ? new Date() : null,
      hiddenReason: values.hidden ? "신고 검토" : null,
      ...(values.createdAt ? { createdAt: values.createdAt } : {}),
    })
    .returning();
  if (!row) throw new Error("tip insert failed");
  return row;
}

/** 테스트 요청의 출처. testEnv의 APP_ORIGIN과 같아야 csrf 검사를 통과합니다(브라우저처럼 Origin을 붙임). */
export const TEST_ORIGIN = "http://localhost:5173";

export function jsonRequest(method: string, body: unknown, cookie?: string): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: TEST_ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  };
}

export function withCookie(cookie: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { Cookie: cookie, Origin: TEST_ORIGIN } };
}
