import type { CreateGuideBody, Guide, UpdateGuideBody } from "@wolgyeham/contracts";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { guides } from "../../db/schema.ts";
import type { Database } from "../../lib/db.ts";

type GuideRow = typeof guides.$inferSelect;

export function toGuide(row: GuideRow): Guide {
  return {
    id: row.id,
    buildingId: row.buildingId,
    category: row.category,
    title: row.title,
    body: row.body,
    photos: row.photos.map((key) => ({ url: key })),
    status: row.status,
    position: row.position,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listGuides(db: Database, buildingId: string, publishedOnly: boolean) {
  return db
    .select()
    .from(guides)
    .where(
      publishedOnly
        ? and(eq(guides.buildingId, buildingId), eq(guides.status, "published"))
        : eq(guides.buildingId, buildingId),
    )
    .orderBy(asc(guides.position), asc(guides.createdAt));
}

export async function findGuide(db: Database, guideId: string) {
  const [row] = await db.select().from(guides).where(eq(guides.id, guideId)).limit(1);
  return row;
}

/** 새 초안은 그 건물 안내의 맨 뒤에 붙습니다. */
export async function insertDraft(
  db: Database,
  values: CreateGuideBody & { buildingId: string; authorUserId: string },
) {
  const [row] = await db
    .insert(guides)
    .values({
      ...values,
      status: "draft",
      position: sql`(select coalesce(max(${guides.position}), 0) + 1 from ${guides} where ${guides.buildingId} = ${values.buildingId})`,
    })
    .returning();
  return row;
}

/** 초안만 고칩니다. 공개된 안내면 0건이라 undefined를 돌려줍니다. */
export async function updateDraft(db: Database, guideId: string, patch: UpdateGuideBody) {
  const [row] = await db
    .update(guides)
    .set(patch)
    .where(and(eq(guides.id, guideId), eq(guides.status, "draft")))
    .returning();
  return row;
}

/** draft → published. 이미 바뀐 안내면 undefined. */
export async function publishDraft(db: Database, guideId: string) {
  const [row] = await db
    .update(guides)
    .set({ status: "published", publishedAt: sql`now()` })
    .where(and(eq(guides.id, guideId), eq(guides.status, "draft")))
    .returning();
  return row;
}

export async function countByBuildingAndStatus(db: Database, buildingIds: string[]) {
  if (buildingIds.length === 0) return [];
  return db
    .select({ buildingId: guides.buildingId, status: guides.status, count: count() })
    .from(guides)
    .where(inArray(guides.buildingId, buildingIds))
    .groupBy(guides.buildingId, guides.status);
}
