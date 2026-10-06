/**
 * 시연 데이터(database.md §8). `db:seed` CLI(`seed.ts`)와 시연 모드 API(`POST /api/dev/reset`, modules/demo)가 같은
 * 함수를 씁니다. 이 파일에는 실행 코드(`import.meta.main`)를 두지 않습니다: 서버 번들에 섞여도 시드가 돌지 않도록.
 */
import {
  type DemoPurpose,
  type DemoUser,
  type GuideCategory,
  REPORT_ACCESS_DAYS,
  REPORT_PRESET_KINDS,
  type TipCategory,
} from "@wolgyeham/contracts";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { hashToken } from "../lib/auth.ts";
import type { Database } from "../lib/db.ts";
import { DEFAULT_RECONFIRM_INTERVAL_DAYS } from "../lib/env.ts";
import {
  buildingManagers,
  buildings,
  contentReports,
  correctionMemos,
  guideRevisions,
  guides,
  joinCodes,
  managerInvites,
  notices,
  occupancies,
  reportAccessTokens,
  reports,
  tips,
  users,
} from "./schema.ts";

/** 로파이의 가상 건물 ‘햇살빌라’. 실제 사람·주소·가입코드는 넣지 않습니다(database.md §8). */
export const DEMO_BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
/** 집주인 시작(초대 → 첫 공개로 open) 시연용. 관리자 없이 preparing으로만 만듭니다. */
export const DEMO_PREPARING_BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f02";
/**
 * 끝까지 해보는 테스트(e2e) 전용 건물. e2e가 안내를 만들고 공개해도 햇살빌라가 바뀌지 않도록 따로 둡니다.
 * 이 건물만 관리하는 집주인(`demo-e2e-landlord`)이 있고, --reset-demo가 시드 상태로 되돌립니다.
 */
export const DEMO_E2E_BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f03";
export const DEMO_E2E_LANDLORD_KAKAO_ID = "demo-e2e-landlord" satisfies DemoUser;
/**
 * e2e의 새 집주인 흐름(초대 → 첫 공개로 open) 전용 건물 ‘준비빌라’. 관리자·안내·가입코드 없이 preparing으로만
 * 만들고, 다시 시드해도 건드리지 않으며 --reset-demo만 이 상태로 되돌립니다.
 */
export const DEMO_E2E_PREPARING_BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f04";
export const DEMO_LANDLORD_KAKAO_ID = "demo-landlord" satisfies DemoUser;
/** 햇살빌라에 연결된 입주자 A와 아직 연결하지 않은 다음 입주자 B. */
export const DEMO_RESIDENT_A_KAKAO_ID = "demo-resident-a" satisfies DemoUser;
export const DEMO_RESIDENT_B_KAKAO_ID = "demo-resident-b" satisfies DemoUser;
/** 로파이(LF-18·02)에 그린 가상 코드. 시연 건물에만 씁니다. */
export const DEMO_JOIN_CODE = "WK72P4";
const DEMO_NOTICE_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f21";
const DEMO_JOIN_CODE_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f31";
const DEMO_OCCUPANCY_A_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f41";
/**
 * 29의 ‘옆 건물 주민(비회원) · 제보 1건 접수됨’. 햇살빌라에 비회원이 자주 쓰는 말로 보낸 확인 전(received) 제보
 * 하나와 그 확인 링크 토큰입니다. 토큰 원문은 시연 전용 고정값이라 여기 두고, DB에는 다른 토큰처럼 SHA-256 해시만
 * 넣습니다. 시연 모드(`GET /api/dev/demo`)만 이 원문으로 확인 링크를 만들어 줍니다. 햇살빌라 제보 하나만 볼 수 있습니다.
 * 원문이 저장소에 공개돼 있으므로 시연 모드로 시드·초기화할 때만(`DemoSeedOptions.guestReport`) 만듭니다.
 */
export const DEMO_GUEST_REPORT_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f81";
export const DEMO_GUEST_REPORT_TOKEN = "demo-guest-report-token-5a3e1c9d2b47";
const DEMO_GUEST_REPORT_TOKEN_ROW_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f82";
const DEMO_RECYCLING_GUIDE_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f11";
const DEMO_PARCEL_GUIDE_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f12";
const GUIDES_UPDATED_AT = new Date("2026-03-16T10:00:00+09:00");
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * --reset-demo가 지우고 다시 만드는 건물. 이 id들 밖의 데이터는 건드리지 않습니다. 햇살빌라·테스트빌라는 집주인이
 * 건물 확인(23)을 마친 상태, 새봄하우스·준비빌라는 초대 → 건물 확인부터 시연하도록 확인 전입니다. 시연 모드 API
 * (`POST /api/dev/reset`)는 발표 시연 건물(`purpose: "demo"`)만 되돌립니다(`resetDemo`의 `scope`).
 */
export const DEMO_BUILDINGS: readonly { id: string; name: string; purpose: DemoPurpose }[] = [
  { id: DEMO_BUILDING_ID, name: "햇살빌라", purpose: "demo" },
  { id: DEMO_PREPARING_BUILDING_ID, name: "새봄하우스", purpose: "demo" },
  { id: DEMO_E2E_BUILDING_ID, name: "테스트빌라", purpose: "e2e" },
  { id: DEMO_E2E_PREPARING_BUILDING_ID, name: "준비빌라", purpose: "e2e" },
];

/** 시연 계정(시연 로그인 `as`)과 29 역할 전환에 쓰는 이름. 실제 권한은 시드한 관계(관리자·연결)로만 생깁니다. */
export const DEMO_ACCOUNTS: readonly {
  as: DemoUser;
  label: string;
  role: "landlord" | "resident";
  purpose: DemoPurpose;
}[] = [
  { as: DEMO_RESIDENT_A_KAKAO_ID, label: "입주자 A", role: "resident", purpose: "demo" },
  { as: DEMO_LANDLORD_KAKAO_ID, label: "집주인", role: "landlord", purpose: "demo" },
  { as: DEMO_RESIDENT_B_KAKAO_ID, label: "다음 입주자 B", role: "resident", purpose: "demo" },
  { as: DEMO_E2E_LANDLORD_KAKAO_ID, label: "테스트빌라 집주인", role: "landlord", purpose: "e2e" },
];

const DEMO_GUIDES = [
  {
    id: DEMO_RECYCLING_GUIDE_ID,
    category: "recycling",
    title: "분리수거함은 주차장 안쪽에 있어요",
    body: [
      "안녕하세요 햇살빌라입니다.",
      "분리수거함은 주차장 안쪽에 있어요.",
      "일반 쓰레기는 매일 저녁 7시 이후, 재활용은 화·금, 음식물은 목·일 저녁에 내놓아 주세요.",
      "페트병은 라벨을 떼고 눌러 주세요.",
    ].join("\n"),
  },
  {
    id: DEMO_PARCEL_GUIDE_ID,
    category: "parcel",
    title: "택배는 1층 현관 안쪽 선반에 놓여요",
    body: [
      "택배는 기사님이 1층 현관 안쪽 선반에 두고 가요.",
      "받은 택배는 되도록 그날 안에 가져가 주세요.",
    ].join("\n"),
  },
  {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f13",
    category: "facility",
    title: "보일러나 수도가 고장 나면 알려 주세요",
    body: [
      "보일러, 수도, 전등이 고장 나면 알려 주세요.",
      "‘집주인에게 알리기’로 보내거나 카톡으로 연락 주셔도 돼요.",
    ].join("\n"),
  },
  {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f14",
    category: "common",
    title: "현관과 복도에 물건을 두지 말아 주세요",
    body: [
      "현관과 계단은 함께 쓰는 통로예요.",
      "자전거와 택배 상자는 각 호실 안에 보관해 주세요.",
      "현관문은 드나들 때 꼭 닫아 주세요.",
    ].join("\n"),
  },
] as const;

/** e2e 건물의 공개 안내. */
const DEMO_E2E_GUIDES = [
  {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f61",
    category: "recycling",
    title: "분리수거는 1층 주차장 옆에 내놓아 주세요",
    body: "재활용은 화·금 저녁, 일반 쓰레기는 매일 저녁 7시 이후에 내놓아 주세요.",
  },
  {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f62",
    category: "parcel",
    title: "택배는 현관 안쪽 선반에 놓여요",
    body: "받은 택배는 되도록 그날 안에 가져가 주세요.",
  },
] as const;

/**
 * 햇살빌라 안내에 달린 확인 전 수정 메모(LF-13 확인할 것·LF-17 검토 시연). 분리수거 메모는 입주자 A가 썼고
 * (A의 ‘내 메모’), 택배 메모는 작성자 연결이 없는 메모(다른 거주자 몫)입니다.
 */
const DEMO_MEMOS = [
  {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f51",
    guideId: DEMO_RECYCLING_GUIDE_ID,
    byResidentA: true,
    body: "재활용 수거일이 이번 달부터 월·목으로 바뀌었어요.",
    createdAt: new Date("2026-09-20T19:40:00+09:00"),
  },
  {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f52",
    guideId: DEMO_PARCEL_GUIDE_ID,
    byResidentA: false,
    body: "택배 선반이 현관 안쪽에서 계단 옆으로 옮겨졌어요.",
    createdAt: new Date("2026-09-24T08:15:00+09:00"),
  },
] as const;

export const DEMO_MEMO_IDS = DEMO_MEMOS.map((memo) => memo.id);

/**
 * 햇살빌라의 생활 팁(로파이 04·03). 분리수거 팁은 입주자 A가 썼고(A의 ‘내 팁’), 나머지는 작성자 연결이 없는
 * 팁(예전 거주자 몫)입니다. 집주인 규칙(수거 요일)이나 설비 조작 같은 안전 판단은 넣지 않습니다(screens.md 화면 규칙).
 */
const DEMO_TIPS: readonly {
  id: string;
  category: TipCategory;
  byResidentA: boolean;
  body: string;
  createdAt: Date;
}[] = [
  {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f71",
    category: "recycling",
    byResidentA: true,
    body: "택배 상자는 테이프를 떼고 펼쳐서 내놓으면 수거함이 덜 차요.",
    createdAt: new Date("2026-09-12T20:10:00+09:00"),
  },
  {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f72",
    category: "parcel",
    byResidentA: false,
    body: "비 오는 날 택배는 현관 안쪽 선반에 올려 두면 젖지 않아요.",
    createdAt: new Date("2026-05-20T18:30:00+09:00"),
  },
  {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f73",
    category: "winter",
    byResidentA: false,
    body: "겨울엔 해가 일찍 져서 뒤편 분리수거함 쪽이 어두워요. 휴대폰 불빛을 켜고 가면 편해요.",
    createdAt: new Date("2025-12-08T21:00:00+09:00"),
  },
  {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f74",
    category: "common",
    byResidentA: false,
    body: "3층 복도 창문은 바람이 불면 덜컹거려요. 걸쇠를 끝까지 걸어주세요.",
    createdAt: new Date("2025-10-15T09:20:00+09:00"),
  },
];

export const DEMO_TIP_IDS = DEMO_TIPS.map((tip) => tip.id);

/**
 * `reconfirmRequested`: 입주자 A를 ‘재확인 요청됨’(하루 전에 요청, 답할 기한 13일 남음)으로 둡니다(시트 40 시연).
 * 없으면 A는 시드한 시점에 확인을 마친 active이고 다음 요청은 `reconfirmIntervalDays` 뒤입니다.
 * `guestReport`: 29의 비회원 시연 제보와 고정 토큰 확인 링크를 만듭니다. 토큰 원문이 공개돼 있어 시연 모드
 * (`DEMO_MODE=true`)일 때만 켭니다. 꺼 두면 만들지 않고, 이미 있는 행도 건드리지 않습니다(`--reset-demo`는 건물째 지우므로
 * 이때 사라짐).
 */
export type DemoSeedOptions = {
  reconfirmRequested?: boolean;
  reconfirmIntervalDays?: number;
  guestReport?: boolean;
};

/**
 * 초기화 범위. `all`(기본, `db:seed -- --reset-demo`)은 시연 건물 네 곳, `demo`(시연 모드 API)는 발표 시연 건물
 * 두 곳(햇살빌라·새봄하우스)만입니다. `demo`면 e2e 건물(테스트빌라·준비빌라)과 e2e 집주인은 건드리지 않습니다.
 */
export type DemoResetScope = "all" | "demo";

/** 시드·초기화할 때마다 1씩 늘어납니다. 시연 목록 캐시(modules/demo)가 이 값이 바뀌면 다시 읽습니다. */
let demoDataVersion = 0;

export function currentDemoDataVersion() {
  return demoDataVersion;
}

/** 시드와 초기화가 동시에 돌면(배포 시드 + 수동 초기화 등) 한쪽이 끝날 때까지 기다리게 하는 잠금 키. */
const DEMO_SEED_LOCK_KEY = 33550002;

function lockDemoRows(tx: Database) {
  return tx.execute(sql`select pg_advisory_xact_lock(${DEMO_SEED_LOCK_KEY})`);
}

/** 여러 번 실행해도 같은 상태가 됩니다. 시연용 행만 되돌리고 다른 데이터는 건드리지 않습니다. */
export async function seedDemo(db: Database, options: DemoSeedOptions = {}) {
  const result = await db.transaction(async (tx) => {
    await lockDemoRows(tx);
    return writeDemoRows(tx, options, { e2e: true });
  });
  demoDataVersion += 1;
  return result;
}

/**
 * 시연 건물(`scope`가 `all`이면 햇살빌라·새봄하우스·테스트빌라·준비빌라, `demo`면 햇살빌라·새봄하우스)을
 * 지우고(cascade) 처음 시드한 상태로 다시 만듭니다. 한 트랜잭션이라 중간에 실패하면 그대로 남습니다. 다른 건물과
 * 사용자는 건드리지 않습니다(입주자 A가 다른 건물에 연결했으면 그 연결은 끝냄, 시드와 같음).
 */
export async function resetDemo(
  db: Database,
  options: DemoSeedOptions & { scope?: DemoResetScope } = {},
) {
  const scope = options.scope ?? "all";
  const targets = DEMO_BUILDINGS.filter(
    (building) => scope === "all" || building.purpose === "demo",
  );
  const result = await db.transaction(async (tx) => {
    await lockDemoRows(tx);
    const ids = targets.map((building) => building.id);
    const guideBuildings = new Map(
      (
        await tx
          .select({ id: guides.id, buildingId: guides.buildingId })
          .from(guides)
          .where(inArray(guides.buildingId, ids))
      ).map((row) => [row.id, row.buildingId]),
    );
    const deletedMemos =
      guideBuildings.size === 0
        ? []
        : await tx
            .delete(correctionMemos)
            .where(inArray(correctionMemos.guideId, [...guideBuildings.keys()]))
            .returning({ guideId: correctionMemos.guideId });
    const deleted = {
      memos: deletedMemos.map((row) => ({ buildingId: guideBuildings.get(row.guideId) ?? "" })),
      guides: await tx
        .delete(guides)
        .where(inArray(guides.buildingId, ids))
        .returning({ buildingId: guides.buildingId }),
      notices: await tx
        .delete(notices)
        .where(inArray(notices.buildingId, ids))
        .returning({ buildingId: notices.buildingId }),
      managers: await tx
        .delete(buildingManagers)
        .where(inArray(buildingManagers.buildingId, ids))
        .returning({ buildingId: buildingManagers.buildingId }),
      invites: await tx
        .delete(managerInvites)
        .where(inArray(managerInvites.buildingId, ids))
        .returning({ buildingId: managerInvites.buildingId }),
      joinCodes: await tx
        .delete(joinCodes)
        .where(inArray(joinCodes.buildingId, ids))
        .returning({ buildingId: joinCodes.buildingId }),
      occupancies: await tx
        .delete(occupancies)
        .where(inArray(occupancies.buildingId, ids))
        .returning({ buildingId: occupancies.buildingId }),
      reports: await tx
        .delete(reports)
        .where(inArray(reports.buildingId, ids))
        .returning({ buildingId: reports.buildingId }),
      tips: await tx
        .delete(tips)
        .where(inArray(tips.buildingId, ids))
        .returning({ buildingId: tips.buildingId }),
    };
    // 남은 관계(나중에 생길 테이블 포함)는 buildings의 ON DELETE cascade로 함께 지워집니다.
    await tx.delete(buildings).where(inArray(buildings.id, ids));
    await writeDemoRows(tx, options, { e2e: scope === "all" });
    const count = (rows: { buildingId: string }[], id: string) =>
      rows.filter((row) => row.buildingId === id).length;
    return targets.map(({ id, name }) => ({
      id,
      name,
      guides: count(deleted.guides, id),
      memos: count(deleted.memos, id),
      notices: count(deleted.notices, id),
      managers: count(deleted.managers, id),
      invites: count(deleted.invites, id),
      joinCodes: count(deleted.joinCodes, id),
      occupancies: count(deleted.occupancies, id),
      reports: count(deleted.reports, id),
      tips: count(deleted.tips, id),
    }));
  });
  demoDataVersion += 1;
  return result;
}

async function upsertDemoUser(tx: Database, kakaoUserId: string) {
  const [row] = await tx
    .insert(users)
    .values({ kakaoUserId })
    .onConflictDoUpdate({ target: users.kakaoUserId, set: { updatedAt: sql`now()` } })
    .returning({ id: users.id });
  if (!row) throw new Error(`demo user ${kakaoUserId} upsert returned no row`);
  return row;
}

/** 공개 안내를 시드 내용으로 되돌립니다(없으면 만듦). 같은 건물의 다른 안내는 건드리지 않습니다. */
async function upsertPublishedGuides(
  tx: Database,
  buildingId: string,
  authorUserId: string,
  list: readonly { id: string; category: GuideCategory; title: string; body: string }[],
) {
  for (const [index, { id, ...guide }] of list.entries()) {
    const values = {
      ...guide,
      buildingId,
      photos: [],
      position: index + 1,
      status: "published" as const,
      publishedAt: GUIDES_UPDATED_AT,
      authorUserId,
      updatedAt: GUIDES_UPDATED_AT,
    };
    await tx
      .insert(guides)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: guides.id, set: values });
  }
}

/**
 * e2e 전용 건물과 그 건물만 관리하는 집주인. 시드 안내는 되돌리고(수정본도 지움), e2e가 만든 안내는 --reset-demo가
 * 지웁니다. 준비빌라(e2e 새 집주인 흐름)는 새봄하우스처럼 한 번 만든 뒤에는 건드리지 않습니다(관리자를 붙이지 않음).
 */
async function writeE2eRows(tx: Database) {
  const e2eLandlord = await upsertDemoUser(tx, DEMO_E2E_LANDLORD_KAKAO_ID);
  const e2eBuilding = {
    name: "테스트빌라",
    displayAddress: "서울 노원구 월계동 OO길",
    fullAddress: "서울 노원구 월계동 000-02",
    status: "open" as const,
    openedAt: GUIDES_UPDATED_AT,
    confirmedAt: GUIDES_UPDATED_AT,
  };
  await tx
    .insert(buildings)
    .values({ id: DEMO_E2E_BUILDING_ID, ...e2eBuilding })
    .onConflictDoUpdate({ target: buildings.id, set: e2eBuilding });
  await tx
    .insert(buildingManagers)
    .values({ buildingId: DEMO_E2E_BUILDING_ID, userId: e2eLandlord.id })
    .onConflictDoNothing();
  await upsertPublishedGuides(tx, DEMO_E2E_BUILDING_ID, e2eLandlord.id, DEMO_E2E_GUIDES);
  await tx.delete(guideRevisions).where(
    inArray(
      guideRevisions.guideId,
      DEMO_E2E_GUIDES.map((guide) => guide.id),
    ),
  );
  await tx
    .insert(buildings)
    .values({
      id: DEMO_E2E_PREPARING_BUILDING_ID,
      name: "준비빌라",
      displayAddress: "서울 노원구 월계동 OO길",
      fullAddress: "서울 노원구 월계동 000-03",
      status: "preparing",
    })
    .onConflictDoNothing();
}

/**
 * 옆 건물 주민(비회원)의 제보는 확인 전(received)으로 되돌리고, 확인 링크 토큰의 기한을 지금부터 30일로 잡습니다.
 * 시연 중 새로 들어온 제보는 남고 --reset-demo로만 지워집니다. 시연 모드일 때만 부릅니다(`DemoSeedOptions.guestReport`).
 */
async function writeGuestReport(tx: Database, now: number) {
  const receivedAt = new Date(now - 2 * 60 * 60 * 1000);
  const guestReport = {
    buildingId: DEMO_BUILDING_ID,
    reporterUserId: null,
    reporterKind: "guest" as const,
    preset: "trash_overflow" as const,
    kind: REPORT_PRESET_KINDS.trash_overflow,
    location: null,
    body: null,
    status: "received" as const,
    resultNote: null,
    acknowledgedAt: null,
    resolvedAt: null,
    createdAt: receivedAt,
    updatedAt: receivedAt,
  };
  await tx
    .insert(reports)
    .values({ id: DEMO_GUEST_REPORT_ID, ...guestReport })
    .onConflictDoUpdate({ target: reports.id, set: guestReport });
  const guestToken = {
    reportId: DEMO_GUEST_REPORT_ID,
    tokenHash: hashToken(DEMO_GUEST_REPORT_TOKEN),
    expiresAt: new Date(now + REPORT_ACCESS_DAYS * DAY_MS),
  };
  await tx
    .insert(reportAccessTokens)
    .values({ id: DEMO_GUEST_REPORT_TOKEN_ROW_ID, ...guestToken })
    .onConflictDoUpdate({ target: reportAccessTokens.id, set: guestToken });
}

/** `e2e`가 false면 e2e 건물(테스트빌라·준비빌라)과 e2e 집주인을 건드리지 않습니다(시연 모드 API의 초기화). */
async function writeDemoRows(tx: Database, options: DemoSeedOptions, parts: { e2e: boolean }) {
  const landlord = await upsertDemoUser(tx, DEMO_LANDLORD_KAKAO_ID);
  const residentA = await upsertDemoUser(tx, DEMO_RESIDENT_A_KAKAO_ID);
  const residentB = await upsertDemoUser(tx, DEMO_RESIDENT_B_KAKAO_ID);

  const building = {
    name: "햇살빌라",
    displayAddress: "서울 노원구 월계동 OO길",
    fullAddress: "서울 노원구 월계동 000-00",
    status: "open" as const,
    openedAt: GUIDES_UPDATED_AT,
    confirmedAt: GUIDES_UPDATED_AT,
  };
  await tx
    .insert(buildings)
    .values({ id: DEMO_BUILDING_ID, ...building })
    .onConflictDoUpdate({ target: buildings.id, set: building });
  await tx
    .insert(buildingManagers)
    .values({ buildingId: DEMO_BUILDING_ID, userId: landlord.id })
    .onConflictDoNothing();

  // 한 번 만든 뒤에는 건드리지 않습니다(시연 중 공개한 안내·관리자·건물 확인을 지우지 않음). 처음엔 확인 전입니다.
  await tx
    .insert(buildings)
    .values({
      id: DEMO_PREPARING_BUILDING_ID,
      name: "새봄하우스",
      displayAddress: "서울 노원구 월계동 OO길",
      fullAddress: "서울 노원구 월계동 000-01",
      status: "preparing",
    })
    .onConflictDoNothing();

  await upsertPublishedGuides(tx, DEMO_BUILDING_ID, landlord.id, DEMO_GUIDES);
  if (parts.e2e) await writeE2eRows(tx);

  // 시드한 시점에 현재 공지로 보이도록 기간을 지금 기준으로 잡습니다.
  const now = Date.now();
  const notice = {
    buildingId: DEMO_BUILDING_ID,
    title: "9월 28일(일) 오전 단수 안내",
    body: [
      "건물 물탱크 청소로 위 시간 동안 물이 나오지 않아요. 전날 밤에 필요한 물을 미리 받아 두세요.",
      "작업이 일찍 끝나면 따로 알리지 않고 바로 물이 나와요.",
    ].join("\n"),
    startsAt: new Date(now - DAY_MS),
    endsAt: new Date(now + 7 * DAY_MS),
    status: "published" as const,
    publishedAt: new Date(now - DAY_MS),
    authorUserId: landlord.id,
  };
  await tx
    .insert(notices)
    .values({ id: DEMO_NOTICE_ID, ...notice })
    .onConflictDoUpdate({ target: notices.id, set: notice });

  // 시연 중 바꾼 코드는 끝내고 로파이의 코드로 되돌립니다.
  await tx
    .update(joinCodes)
    .set({ retiredAt: sql`now()` })
    .where(
      and(
        eq(joinCodes.buildingId, DEMO_BUILDING_ID),
        ne(joinCodes.id, DEMO_JOIN_CODE_ID),
        isNull(joinCodes.retiredAt),
      ),
    );
  const joinCode = {
    buildingId: DEMO_BUILDING_ID,
    code: DEMO_JOIN_CODE,
    createdByUserId: landlord.id,
    retiredAt: null,
  };
  await tx
    .insert(joinCodes)
    .values({ id: DEMO_JOIN_CODE_ID, ...joinCode })
    .onConflictDoUpdate({ target: joinCodes.id, set: joinCode });

  // 시연 중 저장한 수정본은 버리고, 시드 메모는 확인 전으로 되돌립니다. 시연 중 새로 남긴 메모는 남습니다.
  await tx.delete(guideRevisions).where(
    inArray(
      guideRevisions.guideId,
      DEMO_GUIDES.map((guide) => guide.id),
    ),
  );
  for (const { id, byResidentA, ...memo } of DEMO_MEMOS) {
    const values = {
      ...memo,
      authorUserId: byResidentA ? residentA.id : null,
      status: "pending" as const,
      keptReason: null,
      resolvedAt: null,
    };
    await tx
      .insert(correctionMemos)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: correctionMemos.id, set: values });
  }

  // 시드 팁은 시드 내용으로 되돌리고(가림·삭제 해제) 그 팁의 신고는 지웁니다. 시연 중 새로 남긴 팁은 남습니다.
  await tx.delete(contentReports).where(inArray(contentReports.tipId, DEMO_TIP_IDS));
  for (const { id, byResidentA, ...tip } of DEMO_TIPS) {
    const values = {
      ...tip,
      buildingId: DEMO_BUILDING_ID,
      authorUserId: byResidentA ? residentA.id : null,
      hiddenAt: null,
      hiddenReason: null,
      deletedAt: null,
      updatedAt: tip.createdAt,
    };
    await tx
      .insert(tips)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: tips.id, set: values });
  }

  if (options.guestReport) await writeGuestReport(tx, now);

  // 입주자 A는 햇살빌라에 active로 연결합니다. 시연 중 다른 건물로 옮겼으면 그 연결을 끝냅니다.
  await tx
    .update(occupancies)
    .set({ status: "inactive", endedAt: sql`now()` })
    .where(
      and(
        eq(occupancies.userId, residentA.id),
        ne(occupancies.id, DEMO_OCCUPANCY_A_ID),
        ne(occupancies.status, "inactive"),
      ),
    );
  const intervalDays = options.reconfirmIntervalDays ?? DEFAULT_RECONFIRM_INTERVAL_DAYS;
  const occupancyA = {
    buildingId: DEMO_BUILDING_ID,
    userId: residentA.id,
    status: "active" as const,
    connectedAt: GUIDES_UPDATED_AT,
    ...(options.reconfirmRequested
      ? { lastReconfirmedAt: null, nextReconfirmAt: new Date(now - DAY_MS) }
      : {
          lastReconfirmedAt: new Date(now),
          nextReconfirmAt: new Date(now + intervalDays * DAY_MS),
        }),
    endedAt: null,
  };
  await tx
    .insert(occupancies)
    .values({ id: DEMO_OCCUPANCY_A_ID, ...occupancyA })
    .onConflictDoUpdate({ target: occupancies.id, set: occupancyA });

  return {
    buildingId: DEMO_BUILDING_ID,
    preparingBuildingId: DEMO_PREPARING_BUILDING_ID,
    e2eBuildingId: DEMO_E2E_BUILDING_ID,
    e2ePreparingBuildingId: DEMO_E2E_PREPARING_BUILDING_ID,
    landlordUserId: landlord.id,
    residentAUserId: residentA.id,
    residentBUserId: residentB.id,
  };
}
