import { randomInt, timingSafeEqual } from "node:crypto";
import {
  type AcceptManagerInviteResult,
  type CurrentJoinCode,
  JOIN_CODE_LENGTH,
  JOIN_CODE_MAX_FAILURES,
  type JoinCode,
  type JoinCodeCheckResult,
  type ManagedBuilding,
  type ManagerInvitePreview,
  normalizeJoinCode,
  type PublicBuilding,
} from "@wolgyeham/contracts";
import { createToken, hashToken, isManager, requireManager } from "../../lib/auth.ts";
import { type Database, isUniqueViolation } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import { log } from "../../lib/log.ts";
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

/** 건물 이름 고치기(집주인). 주소(팀 확인값)와 상태는 그대로입니다. 이름은 contracts `BuildingName`으로 검증된 값입니다. */
export async function renameBuilding(
  db: Database,
  userId: string,
  buildingId: string,
  name: string,
): Promise<ManagedBuilding> {
  const building = await requireBuilding(db, buildingId);
  await requireManager(db, userId, building.id);
  const row = await repo.updateBuildingName(db, building.id, name);
  if (!row) throw new AppError(404, "NOT_FOUND");
  return repo.toManagedBuilding(row);
}

/**
 * 건물 확인(LF-12·23). 처음 부를 때 `confirmed_at`을 남기고, 이미 확인했으면 그 시각을 그대로 두고 성공합니다(뒤로
 * 갔다가 다시 눌러도 됨). `name`을 보내면 같은 문장에서 이름도 바꿉니다.
 */
export async function confirmBuilding(
  db: Database,
  userId: string,
  buildingId: string,
  name: string | undefined,
): Promise<ManagedBuilding> {
  const building = await requireBuilding(db, buildingId);
  await requireManager(db, userId, building.id);
  const row = await repo.confirmBuilding(db, building.id, name);
  if (!row) throw new AppError(404, "NOT_FOUND");
  return repo.toManagedBuilding(row);
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

/** 헷갈리는 글자(0·O·1·I·L)를 뺀 31자. */
const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++)
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}

/** 현재 가입코드(LF-18). 만든 적이 없으면 null입니다. */
export async function getJoinCode(
  db: Database,
  userId: string,
  buildingId: string,
): Promise<CurrentJoinCode> {
  const building = await requireBuilding(db, buildingId);
  await requireManager(db, userId, building.id);
  const row = await repo.findCurrentJoinCode(db, building.id);
  return { joinCode: row ? repo.toJoinCode(row) : null };
}

/**
 * 새 가입코드를 만들고 이전 코드를 끝냅니다(처음이면 만들기만). 이미 연결된 거주자는 그대로입니다.
 * 동시에 두 번 바꾸면 한쪽은 부분 유니크 인덱스에 걸려 409 `CONFLICT`입니다.
 */
export async function rotateJoinCode(
  db: Database,
  userId: string,
  buildingId: string,
): Promise<JoinCode> {
  const building = await requireBuilding(db, buildingId);
  await requireManager(db, userId, building.id);
  try {
    return await db.transaction(async (tx) => {
      await repo.retireCurrentJoinCode(tx, building.id);
      const row = await repo.insertJoinCode(tx, {
        buildingId: building.id,
        code: generateJoinCode(),
        createdByUserId: userId,
      });
      if (!row) throw new Error("join code insert returned no row");
      return repo.toJoinCode(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(409, "CONFLICT");
    throw error;
  }
}

function lockedError(lockedUntil: Date) {
  const seconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
  return new AppError(429, "JOIN_CODE_LOCKED", undefined, { "Retry-After": String(seconds) });
}

function sameCode(expected: string, input: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(normalizeJoinCode(input));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * 건물 전체의 시도 기록 키. 로그인하지 않은 확인(IP 키)만 여기에 셉니다. 여러 IP로 나눠 틀려도 건물마다 10분에
 * 이만큼만 코드를 비교합니다. 로그인한 사람의 연결은 사용자 키로만 제한해, 이 상한이 거주자 연결을 막지 않습니다.
 */
export const BUILDING_ATTEMPT_KEY = "building";
export const JOIN_CODE_BUILDING_MAX_ATTEMPTS = 30;

/**
 * 가입코드를 확인합니다. 코드를 비교하기 전에 키마다 시도를 한 번 세고, 이미 잠겼거나 이번 시도가 5번째를 넘으면
 * 코드를 보지 않고 429 `JOIN_CODE_LOCKED`입니다(동시에 보낸 요청도 키마다 5번까지만 비교). `countBuilding`이면
 * (로그인하지 않은 확인) 키 검사를 통과해 실제로 비교할 요청만 건물 전체 기록을 하나 쓰고, 건물이 잠겼으면(10분에
 * 30번) 비교하지 않고 429입니다. 틀리면 409 `JOIN_CODE_INVALID`(5번째로 틀리면 그 키를 잠그고 429). 맞으면 그
 * 키들의 기록을 지우고, 건물 기록은 잠기지 않았을 때 하나 돌려줍니다(맞힌 확인이 건물 한도를 쓰지 않음). 기록은
 * 호출한 쪽의 트랜잭션 밖에서 남겨야 합니다(오류로 되돌려지지 않도록).
 */
export async function verifyJoinCode(
  db: Database,
  buildingId: string,
  code: string,
  clientKeys: string[],
  options: { countBuilding: boolean },
) {
  await repo.deleteStaleJoinCodeAttempts(db);
  let lockedUntil: Date | undefined;
  const keep = (row: { lockedUntil: Date | null } | undefined) => {
    if (row?.lockedUntil && (!lockedUntil || row.lockedUntil > lockedUntil)) {
      lockedUntil = row.lockedUntil;
    }
  };
  /** 이번 시도가 한도째(5번째)인 키. 이번 코드가 틀리면 이 키들을 잠급니다. */
  const lastChance: string[] = [];
  for (const key of clientKeys) {
    const row = await repo.recordJoinCodeAttempt(db, buildingId, key, JOIN_CODE_MAX_FAILURES);
    keep(row);
    if (row && row.failedCount >= JOIN_CODE_MAX_FAILURES) lastChance.push(key);
  }
  // 잠긴 키의 요청은 비교하지 않으므로 건물 한도를 쓰지 않습니다.
  if (lockedUntil) throw lockedError(lockedUntil);
  if (options.countBuilding) {
    const building = await repo.recordJoinCodeAttempt(
      db,
      buildingId,
      BUILDING_ATTEMPT_KEY,
      JOIN_CODE_BUILDING_MAX_ATTEMPTS,
    );
    if (building?.failedCount === JOIN_CODE_BUILDING_MAX_ATTEMPTS + 1) {
      // 한 건물에 여러 곳에서 틀린 코드가 몰림: 10분 동안 로그인하지 않은 확인을 막습니다.
      log("warn", "join_code_building_locked", { buildingId });
    }
    keep(building);
    if (lockedUntil) throw lockedError(lockedUntil);
  }
  const current = await repo.findCurrentJoinCode(db, buildingId);
  if (current && sameCode(current.code, code)) {
    await repo.clearJoinCodeAttempts(db, buildingId, clientKeys);
    if (options.countBuilding)
      await repo.refundBuildingAttempt(db, buildingId, BUILDING_ATTEMPT_KEY);
    return;
  }
  const newLock = await repo.lockKeys(db, buildingId, lastChance);
  if (newLock) throw lockedError(newLock);
  throw new AppError(409, "JOIN_CODE_INVALID");
}

/**
 * 가입코드 확인(1/2). 실패 횟수만 남기고 연결은 만들지 않습니다. 로그인하지 않은 확인(`signedIn` false)만 건물
 * 전체 상한을 씁니다.
 */
export async function checkJoinCode(
  db: Database,
  buildingId: string,
  code: string,
  clientKeys: string[],
  signedIn: boolean,
): Promise<JoinCodeCheckResult> {
  const building = await requireBuilding(db, buildingId);
  await verifyJoinCode(db, building.id, code, clientKeys, { countBuilding: !signedIn });
  return { buildingId: building.id, buildingName: building.name };
}
