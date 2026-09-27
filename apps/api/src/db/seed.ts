import { sql } from "drizzle-orm";
import { createDatabase, type Database } from "../lib/db.ts";
import { EnvFields } from "../lib/env.ts";
import { buildingManagers, buildings, guides, notices, users } from "./schema.ts";

/** 로파이의 가상 건물 ‘햇살빌라’. 실제 사람·주소·가입코드는 넣지 않습니다(database.md §8). */
export const DEMO_BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
/** 집주인 시작(초대 → 첫 공개로 open) 시연용. 관리자 없이 preparing으로만 만듭니다. */
export const DEMO_PREPARING_BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f02";
export const DEMO_LANDLORD_KAKAO_ID = "demo-landlord";
const DEMO_NOTICE_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f21";
const GUIDES_UPDATED_AT = new Date("2026-03-16T10:00:00+09:00");
const DAY_MS = 24 * 60 * 60 * 1000;

const DEMO_GUIDES = [
  {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f11",
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
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f12",
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

/** 여러 번 실행해도 같은 상태가 됩니다. 시연용 행만 되돌리고 다른 데이터는 건드리지 않습니다. */
export function seedDemo(db: Database) {
  return db.transaction(async (tx) => {
    const [landlord] = await tx
      .insert(users)
      .values({ kakaoUserId: DEMO_LANDLORD_KAKAO_ID })
      .onConflictDoUpdate({ target: users.kakaoUserId, set: { updatedAt: sql`now()` } })
      .returning({ id: users.id });
    if (!landlord) throw new Error("demo landlord upsert returned no row");

    const building = {
      name: "햇살빌라",
      displayAddress: "서울 노원구 월계동 OO길",
      fullAddress: "서울 노원구 월계동 000-00",
      status: "open" as const,
      openedAt: GUIDES_UPDATED_AT,
    };
    await tx
      .insert(buildings)
      .values({ id: DEMO_BUILDING_ID, ...building })
      .onConflictDoUpdate({ target: buildings.id, set: building });
    await tx
      .insert(buildingManagers)
      .values({ buildingId: DEMO_BUILDING_ID, userId: landlord.id })
      .onConflictDoNothing();

    // 한 번 만든 뒤에는 건드리지 않습니다(시연 중 공개한 안내·관리자를 지우지 않음).
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

    for (const [index, { id, ...guide }] of DEMO_GUIDES.entries()) {
      const values = {
        ...guide,
        buildingId: DEMO_BUILDING_ID,
        photos: [],
        position: index + 1,
        status: "published" as const,
        publishedAt: GUIDES_UPDATED_AT,
        authorUserId: landlord.id,
        updatedAt: GUIDES_UPDATED_AT,
      };
      await tx
        .insert(guides)
        .values({ id, ...values })
        .onConflictDoUpdate({ target: guides.id, set: values });
    }

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

    return {
      buildingId: DEMO_BUILDING_ID,
      preparingBuildingId: DEMO_PREPARING_BUILDING_ID,
      landlordUserId: landlord.id,
    };
  });
}

if (import.meta.main) {
  const env = EnvFields.pick({ DATABASE_URL: true, NODE_ENV: true, DEMO_MODE: true }).parse(
    process.env,
  );
  if (env.NODE_ENV === "production" && !env.DEMO_MODE) {
    console.error(
      "db:seed는 production에서 실행하지 않습니다. 시연 환경이면 DEMO_MODE=true로 실행하세요.",
    );
    process.exit(1);
  }
  const database = createDatabase(env.DATABASE_URL, { max: 1 });
  try {
    const result = await seedDemo(database.db);
    console.info(
      `시드 완료: 햇살빌라 /b/${result.buildingId} (시연 집주인 kakao_user_id=demo-landlord)`,
    );
    console.info(
      `준비 중 건물: 새봄하우스 /b/${result.preparingBuildingId} (초대: db:invite ${result.preparingBuildingId})`,
    );
  } finally {
    await database.close();
  }
}
