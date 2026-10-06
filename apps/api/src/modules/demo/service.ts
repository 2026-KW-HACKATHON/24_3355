import {
  DEMO_RESET_CLIENT_HOURLY_LIMIT,
  DEMO_RESET_CLIENT_INTERVAL_SECONDS,
  DEMO_RESET_HOURLY_LIMIT,
  DEMO_RESET_INTERVAL_SECONDS,
  type DemoAccount,
  type DemoOverview,
  type DemoResetBody,
  type DemoResetResult,
} from "@wolgyeham/contracts";
import {
  currentDemoDataVersion,
  DEMO_ACCOUNTS,
  DEMO_BUILDING_ID,
  DEMO_BUILDINGS,
  DEMO_GUEST_REPORT_TOKEN,
  resetDemo,
} from "../../db/demo.ts";
import { hashToken } from "../../lib/auth.ts";
import type { Database } from "../../lib/db.ts";
import { log } from "../../lib/log.ts";
import { hitRateLimit } from "../../lib/rate-limit.ts";
import * as buildingService from "../buildings/service.ts";
import * as guideService from "../guides/service.ts";
import * as occupancyService from "../occupancies/service.ts";
import * as reportService from "../reports/service.ts";
import * as tipService from "../tips/service.ts";
import * as repo from "./repo.ts";

/** 모든 사람을 합친 하나의 키로 셉니다(시연 초기화는 누구나 부를 수 있음, D-29). */
const RESET_LIMIT_KEY = "all";
/**
 * `rate_limits.bucket` 이름. 모든 사람 합친 30초·한 시간 창과, 같은 사람(IP 키, lib/client.ts `ipKey`)의 30초·한 시간
 * 창을 따로 셉니다.
 */
export const DEMO_RESET_BUCKETS = {
  interval: "demo-reset-interval",
  hourly: "demo-reset-hourly",
  clientInterval: "demo-reset-client-interval",
  clientHourly: "demo-reset-client-hourly",
};
/** `GET /dev/demo`는 로그인 없이 부를 수 있어, 계산한 결과를 이 프로세스에서 이 시간 동안 함께 씁니다. */
const OVERVIEW_CACHE_MS = 5000;

let overviewCache:
  | { db: Database; version: number; expiresAt: number; value: Promise<DemoOverview> }
  | undefined;

function sum(counts: Map<string, number>) {
  return [...counts.values()].reduce((total, value) => total + value, 0);
}

/**
 * 시연 시작(29)의 건물과 역할 전환 계정. 계정마다 지금 상태(집주인의 확인할 것, 거주자의 연결·팁·메모 수)를
 * 함께 줍니다. 시드하지 않은 건물·계정은 빠집니다. 한 번에 열 개 넘는 쿼리를 쓰므로 5초 동안(같은 DB, 그사이
 * 시드·초기화가 없을 때) 계산한 결과를 함께 씁니다. 동시에 온 요청도 한 번만 계산하고, 실패하면 다음 요청이 다시
 * 계산합니다.
 */
export function getOverview(db: Database): Promise<DemoOverview> {
  const now = Date.now();
  const version = currentDemoDataVersion();
  const cached = overviewCache;
  if (cached && cached.db === db && cached.version === version && cached.expiresAt > now) {
    return cached.value;
  }
  const entry = { db, version, expiresAt: now + OVERVIEW_CACHE_MS, value: loadOverview(db) };
  overviewCache = entry;
  entry.value.catch(() => {
    if (overviewCache === entry) overviewCache = undefined;
  });
  return entry.value;
}

async function loadOverview(db: Database): Promise<DemoOverview> {
  const rows = await repo.findBuildingsWithJoinCode(
    db,
    DEMO_BUILDINGS.map((building) => building.id),
  );
  const byId = new Map(rows.map((row) => [row.building.id, row]));
  const buildings = DEMO_BUILDINGS.flatMap(({ id, purpose }) => {
    const row = byId.get(id);
    if (!row) return [];
    return [
      {
        id,
        name: row.building.name,
        status: row.building.status,
        confirmedAt: row.building.confirmedAt?.toISOString() ?? null,
        purpose,
        joinCode: row.joinCode,
      },
    ];
  });

  const users = new Map(
    (
      await repo.findUsersByKakaoIds(
        db,
        DEMO_ACCOUNTS.map((account) => account.as),
      )
    ).map((user) => [user.kakaoUserId, user.id]),
  );
  const accounts: DemoAccount[] = [];
  for (const account of DEMO_ACCOUNTS) {
    const userId = users.get(account.as);
    if (!userId) continue;
    if (account.role === "landlord") {
      const managed = await buildingService.listManagedBuildings(db, userId);
      const ids = managed.map((building) => building.id);
      accounts.push({
        ...account,
        role: "landlord",
        buildings: managed.map((building) => ({ id: building.id, name: building.name })),
        pendingMemoCount: sum(await guideService.countPendingMemos(db, ids)),
        newReportCount: sum(await reportService.countNewReports(db, ids)),
      });
    } else {
      const tips = await tipService.listMyTips(db, userId);
      accounts.push({
        ...account,
        role: "resident",
        occupancy: await occupancyService.getLiveOccupancy(db, userId),
        tipCount: tips.filter((tip) => !tip.hidden).length,
        memoCount: await repo.countMemosBy(db, userId),
      });
    }
  }
  return { buildings, accounts, guestReport: await findGuestReport(db) };
}

/**
 * 29 ‘옆 건물 주민(비회원)’: 시드한 비회원 제보와 시연 전용 고정 토큰으로 만든 확인 링크(웹 `/r/:reportId#t=`).
 * 토큰 행이 없거나 만료됐으면(시드 뒤 30일) null입니다.
 */
async function findGuestReport(db: Database) {
  const reportId = await repo.findViewableReportId(
    db,
    DEMO_BUILDING_ID,
    hashToken(DEMO_GUEST_REPORT_TOKEN),
  );
  if (!reportId) return null;
  return {
    reportId,
    statusPath: `/r/${reportId}#t=${encodeURIComponent(DEMO_GUEST_REPORT_TOKEN)}`,
  };
}

/**
 * 발표 시연 건물 두 곳(햇살빌라·새봄하우스)만 처음 시드한 상태로 되돌립니다(`db:seed -- --reset-demo`와 같은 함수,
 * 범위 `demo`). e2e 건물(테스트빌라·준비빌라)은 CLI만 되돌립니다. 누구나 부를 수 있으므로 먼저 같은 사람(`clientKey`)
 * 기준 30초에 한 번·한 시간에 10번, 그다음 모든 사람을 합쳐 30초에 한 번·한 시간에 20번까지이고 넘으면 429
 * `RATE_LIMITED`(`Retry-After`)입니다. 같은 사람 제한에 걸린 요청은 전체 횟수를 쓰지 않습니다. 횟수는 초기화
 * 트랜잭션 밖에서 세어 초기화가 실패해도 남습니다.
 */
export async function reset(
  db: Database,
  input: DemoResetBody,
  options: { reconfirmIntervalDays: number; clientKey: string },
): Promise<DemoResetResult> {
  await hitRateLimit(db, DEMO_RESET_BUCKETS.clientInterval, options.clientKey, {
    limit: 1,
    windowSeconds: DEMO_RESET_CLIENT_INTERVAL_SECONDS,
  });
  await hitRateLimit(db, DEMO_RESET_BUCKETS.clientHourly, options.clientKey, {
    limit: DEMO_RESET_CLIENT_HOURLY_LIMIT,
    windowSeconds: 60 * 60,
  });
  await hitRateLimit(db, DEMO_RESET_BUCKETS.interval, RESET_LIMIT_KEY, {
    limit: 1,
    windowSeconds: DEMO_RESET_INTERVAL_SECONDS,
  });
  await hitRateLimit(db, DEMO_RESET_BUCKETS.hourly, RESET_LIMIT_KEY, {
    limit: DEMO_RESET_HOURLY_LIMIT,
    windowSeconds: 60 * 60,
  });
  const summary = await resetDemo(db, {
    scope: "demo",
    reconfirmRequested: input.reconfirmRequested ?? false,
    reconfirmIntervalDays: options.reconfirmIntervalDays,
    // 이 API는 시연 모드에서만 붙으므로 29의 비회원 시연 제보도 되돌립니다.
    guestReport: true,
  });
  log("info", "demo_reset", { buildings: summary.length });
  return {
    buildings: summary.map(({ id, name, ...removed }) => ({ id, name, removed })),
  };
}
