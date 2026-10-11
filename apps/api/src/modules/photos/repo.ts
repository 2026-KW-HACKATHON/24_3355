import { type AnyColumn, type SQL, sql } from "drizzle-orm";
import { guideRevisions, guides, notices } from "../../db/schema.ts";
import type { Database } from "../../lib/db.ts";

/** jsonb 배열 `column`에 `key`가 들어 있는지(`@>`). */
function contains(column: AnyColumn, key: string) {
  return sql`${column} @> ${JSON.stringify([key])}::jsonb`;
}

async function exists(db: Database, query: SQL) {
  const rows = (await db.execute(sql`select (${query}) as found`)) as unknown as {
    found: boolean;
  }[];
  return rows[0]?.found === true;
}

/**
 * 누구나 볼 수 있는 사진인지: 이 건물의 공개된 안내나 지금 보이는 공지(올린 시각이 지났고 끝나지 않음)에 붙어
 * 있으면 true. 건물로 먼저 좁힌 뒤(`building_id` 인덱스) jsonb 포함을 보는 쿼리 하나입니다.
 */
export function isPublicPhoto(db: Database, buildingId: string, key: string) {
  return exists(
    db,
    sql`exists (select 1 from ${guides} where ${guides.buildingId} = ${buildingId}
          and ${guides.status} = 'published' and ${contains(guides.photos, key)})
        or exists (select 1 from ${notices} where ${notices.buildingId} = ${buildingId}
          and ${notices.status} = 'published' and ${notices.publishedAt} <= now()
          and ${notices.endsAt} >= now() and ${contains(notices.photos, key)})`,
  );
}

/** 이 건물의 어떤 행(초안·공개 안내, 수정본, 공지)이든 이 사진을 쓰고 있는지. 파일을 지우기 전에 봅니다. */
export function isReferencedPhoto(db: Database, buildingId: string, key: string) {
  return exists(
    db,
    sql`exists (select 1 from ${guides} where ${guides.buildingId} = ${buildingId}
          and ${contains(guides.photos, key)})
        or exists (select 1 from ${guideRevisions} inner join ${guides}
          on ${guides.id} = ${guideRevisions.guideId}
          where ${guides.buildingId} = ${buildingId} and ${contains(guideRevisions.photos, key)})
        or exists (select 1 from ${notices} where ${notices.buildingId} = ${buildingId}
          and ${contains(notices.photos, key)})`,
  );
}
