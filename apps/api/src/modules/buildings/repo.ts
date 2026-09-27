import type { ManagedBuilding, PublicBuilding } from "@wolgyeham/contracts";
import { and, asc, eq, sql } from "drizzle-orm";
import { buildingManagers, buildings, managerInvites } from "../../db/schema.ts";
import type { Database } from "../../lib/db.ts";

type BuildingRow = typeof buildings.$inferSelect;
type InviteRow = typeof managerInvites.$inferSelect;

export function toPublicBuilding(row: BuildingRow): PublicBuilding {
  return { id: row.id, name: row.name, displayAddress: row.displayAddress, status: row.status };
}

export function toManagedBuilding(row: BuildingRow): ManagedBuilding {
  return {
    ...toPublicBuilding(row),
    fullAddress: row.fullAddress,
    openedAt: row.openedAt?.toISOString() ?? null,
  };
}

export async function findBuilding(db: Database, buildingId: string) {
  const [row] = await db.select().from(buildings).where(eq(buildings.id, buildingId)).limit(1);
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
