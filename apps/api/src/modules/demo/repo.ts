import { and, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  buildings,
  correctionMemos,
  joinCodes,
  reportAccessTokens,
  reports,
  users,
} from "../../db/schema.ts";
import type { Database } from "../../lib/db.ts";

/** 시연 건물과 지금 쓰는 가입코드(없으면 null). */
export function findBuildingsWithJoinCode(db: Database, buildingIds: readonly string[]) {
  return db
    .select({ building: buildings, joinCode: joinCodes.code })
    .from(buildings)
    .leftJoin(joinCodes, and(eq(joinCodes.buildingId, buildings.id), isNull(joinCodes.retiredAt)))
    .where(inArray(buildings.id, [...buildingIds]));
}

/** 시연 계정(`kakao_user_id` = 시연 로그인 `as`)의 사용자 id. 시드하지 않았으면 빠집니다. */
export function findUsersByKakaoIds(db: Database, kakaoUserIds: readonly string[]) {
  return db
    .select({ id: users.id, kakaoUserId: users.kakaoUserId })
    .from(users)
    .where(inArray(users.kakaoUserId, [...kakaoUserIds]));
}

/** 이 사용자가 남긴 수정 메모 수(상태와 관계없이). */
export async function countMemosBy(db: Database, userId: string) {
  const [row] = await db
    .select({ count: count() })
    .from(correctionMemos)
    .where(eq(correctionMemos.authorUserId, userId));
  return row?.count ?? 0;
}

/** 이 토큰 해시로 아직 볼 수 있는(만료 전) 이 건물의 제보 id. 없으면 undefined. */
export async function findViewableReportId(db: Database, buildingId: string, tokenHash: string) {
  const [row] = await db
    .select({ id: reports.id })
    .from(reportAccessTokens)
    .innerJoin(reports, eq(reports.id, reportAccessTokens.reportId))
    .where(
      and(
        eq(reportAccessTokens.tokenHash, tokenHash),
        eq(reports.buildingId, buildingId),
        gt(reportAccessTokens.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return row?.id;
}
