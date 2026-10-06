import {
  JOIN_CODE_LOCK_MINUTES,
  type JoinCode,
  type ManagedBuilding,
  type PublicBuilding,
} from "@wolgyeham/contracts";
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  buildingManagers,
  buildings,
  joinCodeAttempts,
  joinCodes,
  managerInvites,
} from "../../db/schema.ts";
import type { Database } from "../../lib/db.ts";

type BuildingRow = typeof buildings.$inferSelect;
type InviteRow = typeof managerInvites.$inferSelect;
type JoinCodeRow = typeof joinCodes.$inferSelect;

export function toPublicBuilding(row: BuildingRow): PublicBuilding {
  return { id: row.id, name: row.name, displayAddress: row.displayAddress, status: row.status };
}

export function toManagedBuilding(row: BuildingRow): ManagedBuilding {
  return {
    ...toPublicBuilding(row),
    fullAddress: row.fullAddress,
    openedAt: row.openedAt?.toISOString() ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
  };
}

export async function findBuilding(db: Database, buildingId: string) {
  const [row] = await db.select().from(buildings).where(eq(buildings.id, buildingId)).limit(1);
  return row;
}

/** 이름만 바꿉니다. 주소·상태는 건드리지 않습니다. */
export async function updateBuildingName(db: Database, buildingId: string, name: string) {
  const [row] = await db
    .update(buildings)
    .set({ name })
    .where(eq(buildings.id, buildingId))
    .returning();
  return row;
}

/** 건물 확인. 처음 확인한 시각만 남기고(`coalesce`), 이름을 보냈으면 같은 문장에서 바꿉니다. */
export async function confirmBuilding(db: Database, buildingId: string, name: string | undefined) {
  const [row] = await db
    .update(buildings)
    .set({ confirmedAt: sql`coalesce(${buildings.confirmedAt}, now())`, ...(name ? { name } : {}) })
    .where(eq(buildings.id, buildingId))
    .returning();
  return row;
}

export async function listBuildingsManagedBy(db: Database, userId: string) {
  const rows = await db
    .select({ building: buildings })
    .from(buildingManagers)
    .innerJoin(buildings, eq(buildings.id, buildingManagers.buildingId))
    .where(eq(buildingManagers.userId, userId))
    .orderBy(asc(buildingManagers.createdAt));
  return rows.map((row) => row.building);
}

/** preparing → open. 이미 open이면 0건이고 false를 돌려줍니다. */
export async function openBuildingIfPreparing(db: Database, buildingId: string) {
  const rows = await db
    .update(buildings)
    .set({ status: "open", openedAt: sql`now()` })
    .where(and(eq(buildings.id, buildingId), eq(buildings.status, "preparing")))
    .returning({ id: buildings.id });
  return rows.length > 0;
}

export async function findInviteByTokenHash(
  db: Database,
  tokenHash: string,
): Promise<(InviteRow & { buildingName: string }) | undefined> {
  const [row] = await db
    .select({ invite: managerInvites, buildingName: buildings.name })
    .from(managerInvites)
    .innerJoin(buildings, eq(buildings.id, managerInvites.buildingId))
    .where(eq(managerInvites.tokenHash, tokenHash))
    .limit(1);
  return row ? { ...row.invite, buildingName: row.buildingName } : undefined;
}

/** issued → accepted. 이미 바뀐 초대면 0건이고 false를 돌려줍니다. */
export async function markInviteAccepted(db: Database, inviteId: string, userId: string) {
  const rows = await db
    .update(managerInvites)
    .set({ status: "accepted", acceptedByUserId: userId, acceptedAt: sql`now()` })
    .where(and(eq(managerInvites.id, inviteId), eq(managerInvites.status, "issued")))
    .returning({ id: managerInvites.id });
  return rows.length > 0;
}

export async function insertManager(
  db: Database,
  values: { buildingId: string; userId: string; inviteId: string | null },
) {
  await db.insert(buildingManagers).values(values).onConflictDoNothing();
}

export async function insertInvite(
  db: Database,
  values: { buildingId: string; tokenHash: string; expiresAt: Date },
) {
  const [row] = await db.insert(managerInvites).values(values).returning();
  return row;
}

export function toJoinCode(row: JoinCodeRow): JoinCode {
  return { code: row.code, createdAt: row.createdAt.toISOString() };
}

/** 현재 가입코드(`retired_at is null`). 없으면 undefined. */
export async function findCurrentJoinCode(db: Database, buildingId: string) {
  const [row] = await db
    .select()
    .from(joinCodes)
    .where(and(eq(joinCodes.buildingId, buildingId), isNull(joinCodes.retiredAt)))
    .limit(1);
  return row;
}

export async function retireCurrentJoinCode(db: Database, buildingId: string) {
  await db
    .update(joinCodes)
    .set({ retiredAt: sql`now()` })
    .where(and(eq(joinCodes.buildingId, buildingId), isNull(joinCodes.retiredAt)));
}

export async function insertJoinCode(
  db: Database,
  values: { buildingId: string; code: string; createdByUserId: string | null },
) {
  const [row] = await db.insert(joinCodes).values(values).returning();
  return row;
}

const LOCK_INTERVAL = sql.raw(`interval '${JOIN_CODE_LOCK_MINUTES} minutes'`);

/**
 * 코드를 비교하기 전에 시도 한 번을 셉니다(`failed_count`). 행 잠금으로 동시 요청이 한 줄로 서므로 요청마다 서로
 * 다른 번호를 받습니다. 잠금이 풀렸거나(잠금 없이) 창(10분)이 지났으면 1부터 다시 셉니다. 잠겨 있는 동안에는
 * 잠금을 그대로 두고, 이번 시도로 `limit`을 넘으면 그 자리에서 10분 잠급니다. 돌려준 `lockedUntil`이 있으면
 * 코드를 보지 않고 429입니다.
 */
export async function recordJoinCodeAttempt(
  db: Database,
  buildingId: string,
  clientKey: string,
  limit: number,
) {
  const t = joinCodeAttempts;
  const restart = sql`coalesce(${t.lockedUntil} <= now(), ${t.windowStartedAt} <= now() - ${LOCK_INTERVAL})`;
  const [row] = await db
    .insert(t)
    .values({ buildingId, clientKey, failedCount: 1, windowStartedAt: sql`now()` })
    .onConflictDoUpdate({
      target: [t.buildingId, t.clientKey],
      set: {
        failedCount: sql`case when ${restart} then 1 else ${t.failedCount} + 1 end`,
        windowStartedAt: sql`case when ${restart} then now() else ${t.windowStartedAt} end`,
        lockedUntil: sql`case when ${restart} then null
          when ${t.failedCount} + 1 > ${limit} then coalesce(${t.lockedUntil}, now() + ${LOCK_INTERVAL})
          else ${t.lockedUntil} end`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ failedCount: t.failedCount, lockedUntil: t.lockedUntil });
  return row;
}

/**
 * 한도째 시도에서 틀린 키를 10분 잠그고(이미 잠겼으면 그대로), 가장 늦게 풀리는 시각을 돌려줍니다. 키가 없으면
 * undefined.
 */
export async function lockKeys(db: Database, buildingId: string, clientKeys: string[]) {
  if (clientKeys.length === 0) return undefined;
  const rows = await db
    .update(joinCodeAttempts)
    .set({ lockedUntil: sql`coalesce(${joinCodeAttempts.lockedUntil}, now() + ${LOCK_INTERVAL})` })
    .where(
      and(
        eq(joinCodeAttempts.buildingId, buildingId),
        inArray(joinCodeAttempts.clientKey, clientKeys),
      ),
    )
    .returning({ lockedUntil: joinCodeAttempts.lockedUntil });
  const times = rows.flatMap((row) => (row.lockedUntil ? [row.lockedUntil.getTime()] : []));
  return times.length > 0 ? new Date(Math.max(...times)) : undefined;
}

export async function clearJoinCodeAttempts(
  db: Database,
  buildingId: string,
  clientKeys: string[],
) {
  await db
    .delete(joinCodeAttempts)
    .where(
      and(
        eq(joinCodeAttempts.buildingId, buildingId),
        inArray(joinCodeAttempts.clientKey, clientKeys),
      ),
    );
}

/**
 * 맞힌 확인이 쓴 건물 전체 기록을 하나 돌려줍니다(0 아래로는 내리지 않음). 건물이 잠겨 있는 동안에는 돌려주지
 * 않습니다.
 */
export async function refundBuildingAttempt(db: Database, buildingId: string, buildingKey: string) {
  await db
    .update(joinCodeAttempts)
    .set({ failedCount: sql`greatest(${joinCodeAttempts.failedCount} - 1, 0)` })
    .where(
      and(
        eq(joinCodeAttempts.buildingId, buildingId),
        eq(joinCodeAttempts.clientKey, buildingKey),
        or(isNull(joinCodeAttempts.lockedUntil), lte(joinCodeAttempts.lockedUntil, sql`now()`)),
      ),
    );
}

/** 한 번에 지우는 오래된 기록 수. 확인 요청마다 조금씩 지워 요청 시간이 늘지 않게 합니다. */
const STALE_DELETE_LIMIT = 100;

/**
 * 하루 넘게 쓰이지 않은 시도 기록을 건물과 관계없이 최대 100행 지웁니다(IP 키를 오래 두지 않음). 잠금(10분)보다
 * 충분히 깁니다. 확인 요청마다 부릅니다.
 */
export async function deleteStaleJoinCodeAttempts(db: Database) {
  const stale = db
    .select({ id: joinCodeAttempts.id })
    .from(joinCodeAttempts)
    .where(lt(joinCodeAttempts.updatedAt, sql`now() - interval '1 day'`))
    .limit(STALE_DELETE_LIMIT);
  await db.delete(joinCodeAttempts).where(inArray(joinCodeAttempts.id, stale));
}
