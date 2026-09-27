import type {
  AcceptManagerInviteResult,
  ManagedBuilding,
  ManagerInvitePreview,
  PublicBuilding,
} from "@wolgyeham/contracts";
import { createToken, hashToken, isManager, requireManager } from "../../lib/auth.ts";
import type { Database } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import * as repo from "./repo.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function requireBuilding(db: Database, buildingId: string) {
  const building = await repo.findBuilding(db, buildingId);
  if (!building) throw new AppError(404, "NOT_FOUND");
  return building;
}

/** preparing 건물도 돌려줍니다. 웹은 공개 안내가 없으면 LF-14를 보여줍니다. */
export async function getPublicBuilding(db: Database, buildingId: string): Promise<PublicBuilding> {
  return repo.toPublicBuilding(await requireBuilding(db, buildingId));
}

export async function getManagedBuilding(
  db: Database,
  userId: string,
  buildingId: string,
): Promise<ManagedBuilding> {
  const building = await requireBuilding(db, buildingId);
  await requireManager(db, userId, building.id);
  return repo.toManagedBuilding(building);
}

export async function listManagedBuildings(
  db: Database,
  userId: string,
): Promise<ManagedBuilding[]> {
  return (await repo.listBuildingsManagedBy(db, userId)).map(repo.toManagedBuilding);
}

/** 첫 안내 공개 트랜잭션 안에서 부릅니다. 이 호출로 open이 됐으면 true. */
export function openIfPreparing(db: Database, buildingId: string) {
  return repo.openBuildingIfPreparing(db, buildingId);
}

type Invite = NonNullable<Awaited<ReturnType<typeof repo.findInviteByTokenHash>>>;

/** 없거나 이미 수락된 초대는 404, 기간이 지났으면 410. */
function assertUsable(invite: Invite | undefined): asserts invite is Invite {
  if (!invite || invite.status === "accepted") throw new AppError(404, "NOT_FOUND");
  if (invite.status === "expired" || invite.expiresAt.getTime() <= Date.now()) {
    throw new AppError(410, "INVITE_EXPIRED");
  }
}

export async function previewInvite(db: Database, token: string): Promise<ManagerInvitePreview> {
  const invite = await repo.findInviteByTokenHash(db, hashToken(token));
  assertUsable(invite);
  return { buildingName: invite.buildingName };
}

/** 수락과 building_managers 생성은 한 트랜잭션입니다. 이미 관리자면 초대 상태를 바꾸지 않습니다. */
export function acceptInvite(
  db: Database,
  userId: string,
  token: string,
): Promise<AcceptManagerInviteResult> {
  return db.transaction(async (tx) => {
    const invite = await repo.findInviteByTokenHash(tx, hashToken(token));
    if (invite && (await isManager(tx, userId, invite.buildingId))) {
      return { buildingId: invite.buildingId, alreadyManager: true };
    }
    assertUsable(invite);
    if (!(await repo.markInviteAccepted(tx, invite.id, userId))) {
      throw new AppError(409, "CONFLICT");
    }
    await repo.insertManager(tx, {
      buildingId: invite.buildingId,
      userId,
      inviteId: invite.id,
    });
    return { buildingId: invite.buildingId, alreadyManager: false };
  });
}

/** 팀이 확인한 건물에 초대를 발급합니다(db:invite). 토큰 원문은 여기서 한 번만 돌려줍니다. */
export async function issueInvite(db: Database, buildingId: string, validDays: number) {
  const building = await requireBuilding(db, buildingId);
  const token = createToken();
  const invite = await repo.insertInvite(db, {
    buildingId: building.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + validDays * DAY_MS),
  });
  return { token, building, expiresAt: invite?.expiresAt };
}
