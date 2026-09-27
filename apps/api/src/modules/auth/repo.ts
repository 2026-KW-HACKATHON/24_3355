import { eq, sql } from "drizzle-orm";
import { users } from "../../db/schema.ts";
import type { Database } from "../../lib/db.ts";

/** 카카오 회원번호로 사용자를 찾거나 만듭니다. 회원번호 외의 프로필은 저장하지 않습니다. */
export async function upsertUserByKakaoId(db: Database, kakaoUserId: string) {
  const [row] = await db
    .insert(users)
    .values({ kakaoUserId })
    .onConflictDoUpdate({ target: users.kakaoUserId, set: { updatedAt: sql`now()` } })
    .returning({ id: users.id });
  if (!row) throw new Error("user upsert returned no row");
  return row.id;
}

export async function findUserIdByKakaoId(db: Database, kakaoUserId: string) {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.kakaoUserId, kakaoUserId))
    .limit(1);
  return row?.id;
}
