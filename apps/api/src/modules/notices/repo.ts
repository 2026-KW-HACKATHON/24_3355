import type { Notice } from "@wolgyeham/contracts";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { notices } from "../../db/schema.ts";
import type { Database } from "../../lib/db.ts";

type NoticeRow = typeof notices.$inferSelect;

export function toNotice(row: NoticeRow): Notice {
  return {
    id: row.id,
    buildingId: row.buildingId,
    title: row.title,
    body: row.body,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    publishedAt: row.publishedAt.toISOString(),
  };
}

/** 만료 판단은 항상 `ends_at < now()`입니다(database.md §5). */
export async function findCurrentNotice(db: Database, buildingId: string) {
  const [row] = await db
    .select()
    .from(notices)
    .where(
      and(
        eq(notices.buildingId, buildingId),
        eq(notices.status, "published"),
        lte(notices.publishedAt, sql`now()`),
        gte(notices.endsAt, sql`now()`),
      ),
    )
    .orderBy(desc(notices.publishedAt))
    .limit(1);
  return row;
}
