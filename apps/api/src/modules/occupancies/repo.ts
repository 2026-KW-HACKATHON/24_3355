import type { MeOccupancy, Occupancy } from "@wolgyeham/contracts";
import { and, eq, ne, sql } from "drizzle-orm";
import { buildings, occupancies } from "../../db/schema.ts";
import type { Database } from "../../lib/db.ts";
import { nextReconfirmAfter, occupancyState } from "../../lib/reconfirm.ts";

type OccupancyRow = typeof occupancies.$inferSelect;

/** 상태와 재확인 필드는 `now` 기준으로 계산합니다(lib/reconfirm.ts). */
export function toOccupancy(row: OccupancyRow, now = new Date()): Occupancy {
  const state = occupancyState(row, now);
  return {
    id: row.id,
    buildingId: row.buildingId,
    status: state.status,
    connectedAt: row.connectedAt.toISOString(),
    lastReconfirmedAt: row.lastReconfirmedAt?.toISOString() ?? null,
    nextReconfirmAt: row.nextReconfirmAt.toISOString(),
    reconfirmRequested: state.reconfirmRequested,
    reconfirmDueAt: state.reconfirmDueAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

/** 사용자의 살아 있는 연결과 건물 이름(/me). */
export async function findLiveOccupancyWithBuilding(
  db: Database,
  userId: string,
): Promise<MeOccupancy | undefined> {
  const [row] = await db
    .select({ occupancy: occupancies, buildingName: buildings.name })
    .from(occupancies)
    .innerJoin(buildings, eq(buildings.id, occupancies.buildingId))
    .where(and(eq(occupancies.userId, userId), ne(occupancies.status, "inactive")))
    .limit(1);
  if (!row) return undefined;
  return { ...toOccupancy(row.occupancy), buildingName: row.buildingName };
}

export async function findOccupancy(db: Database, occupancyId: string) {
  const [row] = await db.select().from(occupancies).where(eq(occupancies.id, occupancyId)).limit(1);
  return row;
}

/** active·reconfirm_needed → inactive. 이미 끝난 연결이면 0건이고 undefined를 돌려줍니다. */
export async function endOccupancy(db: Database, occupancyId: string) {
  const [row] = await db
    .update(occupancies)
    .set({ status: "inactive", endedAt: sql`now()` })
    .where(and(eq(occupancies.id, occupancyId), ne(occupancies.status, "inactive")))
    .returning();
  return row;
}

/**
 * ‘아직 살아요’: active·reconfirm_needed → active. 확인 시각과 다음 재확인 요청 시각을 새로 적습니다.
 * 이미 끝난 연결이면 0건이고 undefined를 돌려줍니다.
 */
export async function reconfirmOccupancy(db: Database, occupancyId: string, intervalDays: number) {
  const [row] = await db
    .update(occupancies)
    .set({
      status: "active",
      lastReconfirmedAt: sql`now()`,
      nextReconfirmAt: nextReconfirmAfter(intervalDays),
    })
    .where(and(eq(occupancies.id, occupancyId), ne(occupancies.status, "inactive")))
    .returning();
  return row;
}

export async function insertOccupancy(
  db: Database,
  values: { buildingId: string; userId: string },
  intervalDays: number,
) {
  const [row] = await db
    .insert(occupancies)
    .values({ ...values, status: "active", nextReconfirmAt: nextReconfirmAfter(intervalDays) })
    .returning();
  return row;
}
