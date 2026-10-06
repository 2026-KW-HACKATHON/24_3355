import type {
  ConnectBody,
  ConnectResult,
  MeOccupancy,
  OccupancyResult,
} from "@wolgyeham/contracts";
import { findLiveOccupancy } from "../../lib/auth.ts";
import { type Database, isUniqueViolation } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import { occupancyState } from "../../lib/reconfirm.ts";
import * as buildingService from "../buildings/service.ts";
import * as noticeService from "../notices/service.ts";
import * as repo from "./repo.ts";

export async function getLiveOccupancy(db: Database, userId: string): Promise<MeOccupancy | null> {
  return (await repo.findLiveOccupancyWithBuilding(db, userId)) ?? null;
}

/**
 * 가입코드를 다시 확인하고 이 건물과 연결합니다(2/2). 코드 확인과 실패 기록은 트랜잭션 밖에서 합니다.
 * - 이미 이 건물과 연결돼 있으면 새로 만들지 않고 `alreadyConnected`. 재확인 요청 중이거나 reconfirm_needed면
 *   지금 코드를 맞힌 것을 ‘아직 살아요’로 보고 active·확인 시각을 갱신합니다(`reconfirmed`).
 * - 다른 건물과 연결돼 있으면 `replaceOccupancyId`가 그 연결일 때만, 기존 연결 종료·이 계정의 푸시 구독 삭제·
 *   새 연결을 한 트랜잭션에서 처리합니다(웹이 새 건물의 알림 선택을 다시 물음). 새 연결이 실패하면 모두 그대로입니다.
 * `reconfirmIntervalDays`: 새 연결·재확인 뒤 다음 재확인 요청까지의 일수(env `RECONFIRM_INTERVAL_DAYS`).
 */
export async function connect(
  db: Database,
  userId: string,
  buildingId: string,
  input: ConnectBody,
  clientKeys: string[],
  reconfirmIntervalDays: number,
): Promise<ConnectResult & { created: boolean }> {
  const unchanged = { alreadyConnected: true, endedOccupancyId: null, created: false };
  const building = await buildingService.requireBuilding(db, buildingId);
  // 로그인한 연결은 사용자 키로만 셉니다(건물 전체 상한은 로그인하지 않은 확인에만).
  await buildingService.verifyJoinCode(db, building.id, input.code, clientKeys, {
    countBuilding: false,
  });
  try {
    return await db.transaction(async (tx) => {
      const live = await findLiveOccupancy(tx, userId);
      if (live?.buildingId === building.id) {
        if (!occupancyState(live).reconfirmRequested) {
          return { ...unchanged, occupancy: repo.toOccupancy(live), reconfirmed: false };
        }
        const row = await repo.reconfirmOccupancy(tx, live.id, reconfirmIntervalDays);
        if (!row) throw new AppError(409, "CONFLICT");
        return { ...unchanged, occupancy: repo.toOccupancy(row), reconfirmed: true };
      }
      if (live) {
        if (input.replaceOccupancyId !== live.id) throw new AppError(409, "ALREADY_CONNECTED");
        if (!(await repo.endOccupancy(tx, live.id))) throw new AppError(409, "CONFLICT");
        await noticeService.deleteAllSubscriptions(tx, userId);
      }
      const row = await repo.insertOccupancy(
        tx,
        { buildingId: building.id, userId },
        reconfirmIntervalDays,
      );
      if (!row) throw new Error("occupancy insert returned no row");
      return {
        occupancy: repo.toOccupancy(row),
        alreadyConnected: false,
        reconfirmed: false,
        endedOccupancyId: live?.id ?? null,
        created: true,
      };
    });
  } catch (error) {
    // 같은 사용자의 동시 연결 요청: 살아 있는 연결 하나(부분 유니크)에 걸림
    if (isUniqueViolation(error)) throw new AppError(409, "CONFLICT");
    throw error;
  }
}

/** 본인 연결만 다룹니다. 없거나 다른 사람의 연결이면 404로 숨깁니다. */
async function requireOwnOccupancy(db: Database, userId: string, occupancyId: string) {
  const row = await repo.findOccupancy(db, occupancyId);
  if (!row || row.userId !== userId) throw new AppError(404, "NOT_FOUND");
  return row;
}

/**
 * ‘아직 살아요’(40): active·reconfirm_needed → active, 확인 시각을 지금으로, 다음 재확인 요청을
 * `reconfirmIntervalDays` 뒤로 적습니다. 요청 전이어도 받습니다. 이미 끝난 연결이면 409 `CONFLICT`.
 */
export async function reconfirm(
  db: Database,
  userId: string,
  occupancyId: string,
  reconfirmIntervalDays: number,
): Promise<OccupancyResult> {
  const occupancy = await requireOwnOccupancy(db, userId, occupancyId);
  const row = await repo.reconfirmOccupancy(db, occupancy.id, reconfirmIntervalDays);
  if (!row) throw new AppError(409, "CONFLICT");
  return { occupancy: repo.toOccupancy(row) };
}

/**
 * ‘이사했어요’(08): active·reconfirm_needed → inactive. 이 건물의 멤버 기능(메모·팁·공지 알림)이 끝나고,
 * 푸시 구독은 계정에 남지만 inactive라 이 건물 알림 대상에서 빠집니다. 안내·팁·메모는 건물에 남습니다.
 * 이미 끝난 연결이면 409 `CONFLICT`.
 */
export async function moveOut(
  db: Database,
  userId: string,
  occupancyId: string,
): Promise<OccupancyResult> {
  const occupancy = await requireOwnOccupancy(db, userId, occupancyId);
  const row = await repo.endOccupancy(db, occupancy.id);
  if (!row) throw new AppError(409, "CONFLICT");
  return { occupancy: repo.toOccupancy(row) };
}
