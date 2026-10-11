import { DEMO_USERS, type DemoUser } from "@wolgyeham/contracts";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { DEMO_ACCOUNTS, DEMO_BUILDINGS } from "../db/demo.ts";
import { users } from "../db/schema.ts";
import type { AppEnv } from "./context.ts";
import type { Database } from "./db.ts";
import { AppError } from "./errors.ts";

const DEMO_KAKAO_IDS: ReadonlySet<string> = new Set(DEMO_USERS);
const DEMO_BUILDING_IDS: ReadonlySet<string> = new Set(DEMO_BUILDINGS.map((b) => b.id));

/** 시드한 시연 건물인지(`PublicBuilding.demo`). `DEMO_MODE`와 상관없이 id로만 정합니다(D-35). */
export function isDemoBuilding(buildingId: string) {
  // UUID는 대소문자를 가리지 않고(z.uuid, Postgres) 시드 id는 소문자라 맞춰서 봅니다.
  return DEMO_BUILDING_IDS.has(buildingId.toLowerCase());
}

/** 시연 계정이면 그 이름(`Me.user.demo`), 카카오 회원번호로 만든 실제 계정이면 null. */
export function demoUserOf(kakaoUserId: string): DemoUser | null {
  return DEMO_KAKAO_IDS.has(kakaoUserId) ? (kakaoUserId as DemoUser) : null;
}

/**
 * 시연 계정(시연 로그인 `as`)은 시연 건물에만 관리자·거주자로 붙습니다. dev는 시연 건물과 실제 건물이 한 DB에
 * 있고 시연 계정은 /demo에서 누구나 고를 수 있어, 시연 중 그 탭으로 실제 건물의 초대를 수락하거나 가입코드로
 * 연결하면 모르는 사람이 그 건물을 관리하게 됩니다. 그런 요청은 403 `FORBIDDEN`(`fields.account = "demo"`)입니다.
 */
export async function assertDemoScope(db: Database, userId: string, buildingId: string) {
  if (isDemoBuilding(buildingId)) return;
  if (await isDemoAccount(db, userId)) {
    throw new AppError(403, "FORBIDDEN", { account: "demo" });
  }
}

/** 이 사용자가 시연 계정(시연 로그인 `as`)인지. */
export async function isDemoAccount(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ kakaoUserId: users.kakaoUserId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row !== undefined && demoUserOf(row.kakaoUserId) !== null;
}

/**
 * 시연 계정이 실제 건물에서 한 요청이면 로그인하지 않은 사람으로 다룰지(D-35). 제보처럼 누구나 할 수 있는 일은
 * 막지 않고, 시연 계정에 실제 건물의 기록이 붙어(그 역할을 고르는 누구에게나 보이고 시연 초기화로도 지워지지 않음)
 * 남지 않게 합니다.
 */
export async function actsAsGuestHere(db: Database, userId: string, buildingId: string) {
  return !isDemoBuilding(buildingId) && (await isDemoAccount(db, userId));
}

/**
 * 둘러보기 전용 시연(D-35). 발표 시연 계정(`DEMO_ACCOUNTS`의 `purpose: "demo"`: 집주인·입주자 A·다음 입주자 B)과
 * 발표 시연 건물(`DEMO_BUILDINGS`의 `purpose: "demo"`: 햇살빌라·새봄하우스)은 바꿀 수 없습니다. 포스터 QR의 `/demo`는
 * 고정된 화면을 보여 주는 곳이고, 실제로 해 보는 것은 실제 건물에서 카카오 계정으로 합니다. e2e 전용 계정·건물
 * (테스트빌라·준비빌라·`demo-e2e-landlord`)은 끝까지 해보는 테스트가 쓰므로 그대로 둡니다.
 */
const READONLY_DEMO_KAKAO_IDS: ReadonlySet<string> = new Set(
  DEMO_ACCOUNTS.filter((account) => account.purpose === "demo").map((account) => account.as),
);
const READONLY_DEMO_BUILDING_IDS: ReadonlySet<string> = new Set(
  DEMO_BUILDINGS.filter((building) => building.purpose === "demo").map((building) => building.id),
);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/**
 * 쓰기 모양이지만 둘러보기에 필요한 요청: 역할 바꾸기·시연 끝내기·로그아웃, 운영자 복구(시연 초기화), 약관 동의
 * 기록, 그리고 바꾸지 않는 확인 요청(초대 미리보기, 비회원 제보 확인 토큰 조회, 가입코드 확인).
 */
const READONLY_EXEMPT = [
  /^\/api\/dev\/(login|end-demo|reset)$/,
  /^\/api\/auth\/logout$/,
  /^\/api\/me\/terms-consent$/,
  /^\/api\/manager-invites\/preview$/,
  /^\/api\/buildings\/[^/]+\/reports\/lookup$/,
  /^\/api\/buildings\/[^/]+\/join-code\/check$/,
];
const BUILDING_PATH = /^\/api\/(?:manage\/)?buildings\/([^/]+)/;

/** 발표 시연 건물인지(둘러보기 전용, 햇살빌라·새봄하우스). */
export function isReadOnlyDemoBuilding(buildingId: string) {
  return READONLY_DEMO_BUILDING_IDS.has(buildingId.toLowerCase());
}

export function demoReadOnlyError() {
  return new AppError(403, "FORBIDDEN", { account: "demo-readonly" });
}

/** 발표 시연 계정인지(둘러보기 전용). */
export function isReadOnlyDemoKakaoId(kakaoUserId: string) {
  return READONLY_DEMO_KAKAO_IDS.has(kakaoUserId);
}

/**
 * 세션을 읽은 뒤 붙입니다. 발표 시연 계정의 쓰기와, 누구든(로그인 전 포함) 발표 시연 건물에 하는 쓰기(제보 포함)를
 * 403 `FORBIDDEN`(`fields.account = "demo-readonly"`)으로 막습니다. GET·HEAD·OPTIONS와 `READONLY_EXEMPT`는 그대로입니다.
 */
export const demoReadOnly = createMiddleware<AppEnv>(async (c, next) => {
  const path = c.req.path;
  if (SAFE_METHODS.has(c.req.method) || READONLY_EXEMPT.some((pattern) => pattern.test(path))) {
    await next();
    return;
  }
  const buildingId = BUILDING_PATH.exec(path)?.[1];
  if (buildingId && isReadOnlyDemoBuilding(buildingId)) throw demoReadOnlyError();
  const user = c.var.user;
  if (user) {
    const [row] = await c.var.db
      .select({ kakaoUserId: users.kakaoUserId })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (row && isReadOnlyDemoKakaoId(row.kakaoUserId)) throw demoReadOnlyError();
  }
  await next();
});
