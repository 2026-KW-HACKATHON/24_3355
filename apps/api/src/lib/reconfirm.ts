import { type OccupancyStatus, RECONFIRM_GRACE_DAYS } from "@wolgyeham/contracts";
import { and, eq, gt } from "drizzle-orm";
import { occupancies } from "../db/schema.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
/** 답할 기한은 달력 날짜가 아니라 정확히 14×24시간입니다(JS 계산과 SQL 조건이 같은 값을 씀). */
const GRACE_MS = RECONFIRM_GRACE_DAYS * DAY_MS;

export type OccupancyState = {
  status: OccupancyStatus;
  reconfirmRequested: boolean;
  reconfirmDueAt: Date;
};

/**
 * 재확인 상태는 스케줄러 없이 읽을 때 계산합니다(backend.md §7 재확인). DB `status`는 연결·재확인·이사 요청으로만
 * 바뀌고, `next_reconfirm_at`이 지나면 재확인 요청 중, 그 뒤 14일이 지나면 `reconfirm_needed`로 봅니다.
 */
export function occupancyState(
  row: { status: OccupancyStatus; nextReconfirmAt: Date },
  now: Date = new Date(),
): OccupancyState {
  const reconfirmDueAt = new Date(row.nextReconfirmAt.getTime() + GRACE_MS);
  if (row.status === "inactive") {
    return { status: "inactive", reconfirmRequested: false, reconfirmDueAt };
  }
  const needed = row.status === "reconfirm_needed" || now >= reconfirmDueAt;
  return {
    status: needed ? "reconfirm_needed" : "active",
    reconfirmRequested: needed || now >= row.nextReconfirmAt,
    reconfirmDueAt,
  };
}

/**
 * SQL 조건: `now` 기준으로 active인 연결(재확인 요청 뒤 14×24시간이 지나지 않음). 공지 알림 대상·연결된 거주자
 * 수에 씁니다. DB 시계(`now()`) 대신 앱 시각을 넘겨 `occupancyState`와 같은 경계를 씁니다.
 */
export function activeNow(now: Date = new Date()) {
  return and(
    eq(occupancies.status, "active"),
    gt(occupancies.nextReconfirmAt, new Date(now.getTime() - GRACE_MS)),
  );
}

/** 연결하거나 ‘아직 살아요’를 누를 때 적는 다음 재확인 요청 시각(`now`부터 `intervalDays`×24시간 뒤). */
export function nextReconfirmAfter(intervalDays: number, now: Date = new Date()) {
  return new Date(now.getTime() + intervalDays * DAY_MS);
}
