import { DEMO_USERS } from "@wolgyeham/contracts";
import { eq } from "drizzle-orm";
import { DEMO_BUILDINGS } from "../db/demo.ts";
import { users } from "../db/schema.ts";
import type { Database } from "./db.ts";
import { AppError } from "./errors.ts";

const DEMO_KAKAO_IDS: ReadonlySet<string> = new Set(DEMO_USERS);
const DEMO_BUILDING_IDS: ReadonlySet<string> = new Set(DEMO_BUILDINGS.map((b) => b.id));

/**
 * 시연 계정(시연 로그인 `as`)은 시연 건물에만 관리자·거주자로 붙습니다. dev는 시연 건물과 실제 건물이 한 DB에
 * 있고 시연 계정은 /demo에서 누구나 고를 수 있어, 시연 중 그 탭으로 실제 건물의 초대를 수락하거나 가입코드로
 * 연결하면 모르는 사람이 그 건물을 관리하게 됩니다. 그런 요청은 403 `FORBIDDEN`(`fields.account = "demo"`)입니다.
 */
export async function assertDemoScope(db: Database, userId: string, buildingId: string) {
  if (DEMO_BUILDING_IDS.has(buildingId)) return;
  const [row] = await db
    .select({ kakaoUserId: users.kakaoUserId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (row && DEMO_KAKAO_IDS.has(row.kakaoUserId)) {
    throw new AppError(403, "FORBIDDEN", { account: "demo" });
  }
}
