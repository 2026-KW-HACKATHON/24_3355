/**
 * 시연 데이터 CLI(`db:seed`, 이미지에서는 `node seed.mjs`). 사용: db:seed [--reset-demo] [--reconfirm-requested]
 * 시드·초기화 내용은 `demo.ts`에 있고, 시연 모드 API(`POST /api/dev/reset`)도 같은 함수를 씁니다.
 */
import { createDatabase } from "../lib/db.ts";
import { EnvFields } from "../lib/env.ts";
import {
  DEMO_BUILDING_ID,
  DEMO_E2E_BUILDING_ID,
  DEMO_E2E_PREPARING_BUILDING_ID,
  DEMO_PREPARING_BUILDING_ID,
  type DemoSeedOptions,
  resetDemo,
  seedDemo,
} from "./demo.ts";

if (import.meta.main) {
  // pnpm이 넘기는 `--`는 무시합니다. 사용: db:seed [--reset-demo] [--reconfirm-requested]
  const FLAGS = ["--reset-demo", "--reconfirm-requested"];
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const reset = args.includes("--reset-demo");
  if (args.some((arg) => !FLAGS.includes(arg))) {
    console.error("사용: db:seed [--reset-demo] [--reconfirm-requested]");
    process.exit(2);
  }
  const env = EnvFields.pick({
    DATABASE_URL: true,
    NODE_ENV: true,
    DEMO_MODE: true,
    RECONFIRM_INTERVAL_DAYS: true,
  }).parse(process.env);
  const options: DemoSeedOptions = {
    reconfirmRequested: args.includes("--reconfirm-requested"),
    reconfirmIntervalDays: env.RECONFIRM_INTERVAL_DAYS,
    // 비회원 시연 제보의 확인 토큰은 저장소에 공개된 고정값이라 시연 모드에서만 만듭니다.
    guestReport: env.DEMO_MODE,
  };
  if (env.NODE_ENV === "production" && !env.DEMO_MODE) {
    console.error(
      "db:seed는 production에서 실행하지 않습니다. 시연 환경이면 DEMO_MODE=true로 실행하세요.",
    );
    process.exit(1);
  }
  const database = createDatabase(env.DATABASE_URL, { max: 1 });
  try {
    if (reset) {
      for (const building of await resetDemo(database.db, options)) {
        console.info(
          `초기화: ${building.name} (${building.id}) — 안내 ${building.guides}·수정 메모 ${building.memos}·공지 ${building.notices}·관리자 ${building.managers}·초대 ${building.invites}·가입코드 ${building.joinCodes}·연결 ${building.occupancies}·제보 ${building.reports}·팁 ${building.tips}건을 지우고 처음 시드 상태로 다시 만들었습니다.`,
        );
      }
    } else {
      await seedDemo(database.db, options);
    }
    console.info(
      `시드 완료: 햇살빌라 /b/${DEMO_BUILDING_ID} (시연 집주인 demo-landlord, 입주자 A demo-resident-a, 다음 입주자 B demo-resident-b)`,
    );
    if (!options.guestReport) {
      console.info(
        "DEMO_MODE가 꺼져 있어 29의 비회원 시연 제보(고정 확인 링크)는 만들지 않았습니다.",
      );
    }
    if (options.reconfirmRequested) {
      console.info("입주자 A: 재확인 요청됨(하루 전 요청, 13일 뒤 reconfirm_needed)");
    }
    console.info(
      `준비 중 건물: 새봄하우스 /b/${DEMO_PREPARING_BUILDING_ID} (초대: db:invite ${DEMO_PREPARING_BUILDING_ID})`,
    );
    console.info(`e2e 전용 건물: 테스트빌라 /b/${DEMO_E2E_BUILDING_ID} (집주인 demo-e2e-landlord)`);
    console.info(
      `e2e 새 집주인 흐름: 준비빌라 /b/${DEMO_E2E_PREPARING_BUILDING_ID} (관리자 없음, 초대: db:invite ${DEMO_E2E_PREPARING_BUILDING_ID})`,
    );
  } finally {
    await database.close();
  }
}
