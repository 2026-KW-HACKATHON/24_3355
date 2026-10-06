import { and, eq, sql } from "drizzle-orm";
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

export async function findTermsConsent(db: Database, userId: string) {
  const [row] = await db
    .select({ termsVersion: users.termsVersion, termsAgreedAt: users.termsAgreedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row;
}

/** 저장된 판과 다를 때만(처음 동의 포함) 판과 시각을 적습니다. 같은 판이면 처음 동의한 시각을 그대로 둡니다. */
export async function recordTermsConsent(db: Database, userId: string, version: string) {
  await db
    .update(users)
    .set({ termsVersion: version, termsAgreedAt: sql`now()` })
    .where(and(eq(users.id, userId), sql`${users.termsVersion} is distinct from ${version}`));
}
