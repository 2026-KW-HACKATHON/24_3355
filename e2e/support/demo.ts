import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { TERMS_VERSION } from "../../packages/contracts/src/auth.ts";

/** 시드 건물(apps/api/src/db/seed.ts). 읽기 테스트와 시연에 쓰고 데이터를 남기지 않습니다. */
export const SUNNY = {
  id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01",
  name: "햇살빌라",
} as const;
export const SPRING = {
  id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f02",
  name: "새봄하우스",
} as const;
/**
 * 쓰기 테스트 전용 시연 건물과 집주인(시드, `--reset-demo`로 되돌림). 안내 공개처럼 데이터를 남기는
 * 테스트는 여기서만 합니다. 햇살빌라·새봄하우스는 읽기 테스트와 시연에 씁니다.
 */
export const E2E_BUILDING = {
  id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f03",
  name: "테스트빌라",
} as const;
export const E2E_LANDLORD = "demo-e2e-landlord";
/**
 * 새 집주인 흐름(초대 → 첫 공개로 open) 전용 건물. 시드에서 관리자·안내·가입코드 없이 preparing이고,
 * 한 번 공개하면 open이 되어 `--reset-demo`로만 되돌아갑니다.
 */
export const PREP_BUILDING = {
  id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f04",
  name: "준비빌라",
} as const;
/** 햇살빌라에 연결된 입주자 A(시드). 이사 흐름만 연결을 바꾸고 끝나면 되돌립니다. */
export const RESIDENT_A = "demo-resident-a";
/** 아직 연결하지 않은 다음 입주자 B(시드). 연결이 필요한 흐름은 테스트빌라에서 B로 합니다. */
export const RESIDENT_B = "demo-resident-b";
/** 형식은 맞지만 없는 건물(22). */
export const MISSING_BUILDING_ID = "00000000-0000-4000-8000-000000000000";

export type DemoUser =
  | "demo-landlord"
  | typeof RESIDENT_A
  | typeof RESIDENT_B
  | typeof E2E_LANDLORD;

export type PublicGuide = {
  id: string;
  buildingId: string;
  category: string;
  title: string;
  body: string;
  status: "draft" | "published";
};

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * 로그인할 때 함께 보내는 약관 판(D-28). 지금 판에 동의한 계정으로 들어가서 로그인 뒤 ‘약관에 동의해 주세요’
 * 시트가 화면을 덮지 않게 합니다. 동의 시트 자체는 이 하네스의 테스트 대상이 아닙니다.
 */
export const TERMS_CONSENT = TERMS_VERSION;

/**
 * 시연 로그인(POST /api/dev/login). page.request는 브라우저 컨텍스트와 쿠키를 함께 써서
 * 이후 페이지 요청에 세션이 붙습니다. 본문이 JSON이라 CSRF(폼) 검사에 걸리지 않습니다.
 */
export async function loginAs(page: Page, as: DemoUser) {
  const response = await page.request.post("/api/dev/login", {
    data: { as, consent: TERMS_CONSENT },
  });
  expect(response.status(), `시연 로그인(${as})`).toBe(200);
}

/**
 * 쓰기 테스트용 집주인으로 로그인합니다. 시드에 아직 계정이 없으면(400·404) 이 테스트를 건너뜁니다.
 * 건너뛴 테스트는 보고에 그대로 드러나므로, 시드가 준비되면 다시 돌립니다.
 */
export async function loginAsE2eLandlord(page: Page) {
  const response = await page.request.post("/api/dev/login", {
    data: { as: E2E_LANDLORD, consent: TERMS_CONSENT },
  });
  test.skip(
    response.status() === 400 || response.status() === 404,
    `시드에 쓰기 테스트용 집주인(${E2E_LANDLORD})·${E2E_BUILDING.name}이 아직 없어요. 백엔드 시드 반영 뒤 \`pnpm db:seed\`를 하고 다시 돌립니다.`,
  );
  expect(response.status(), `시연 로그인(${E2E_LANDLORD})`).toBe(200);
}

/** 공개 목록 API로 지금 공개된 안내를 셉니다. 숫자를 테스트에 적어 두지 않기 위해서입니다. */
export async function publishedGuides(page: Page, buildingId: string): Promise<PublicGuide[]> {
  const response = await page.request.get(`/api/buildings/${buildingId}/guides`);
  expect(response.ok()).toBe(true);
  const { guides } = (await response.json()) as { guides: PublicGuide[] };
  return guides.filter((guide) => guide.status === "published");
}

export async function buildingStatus(page: Page, buildingId: string): Promise<string> {
  const response = await page.request.get(`/api/buildings/${buildingId}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { status: string }).status;
}

/**
 * 팀이 발급하는 집주인 초대(pnpm --filter @wolgyeham/api db:invite). 토큰 원문은 출력에서 한 번만
 * 보이므로 여기서 읽고 로그에 남기지 않습니다. 발급만으로는 건물 상태가 바뀌지 않습니다.
 */
export function issueInvite(buildingId: string, validDays = 1): string {
  const output = execFileSync(
    "pnpm",
    ["--silent", "--filter", "@wolgyeham/api", "db:invite", buildingId, String(validDays)],
    { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const token = /\/invite#t=(\S+)/.exec(output)?.[1];
  if (!token) throw new Error("db:invite 출력에서 초대 링크를 찾지 못했어요");
  return token;
}

/** 테스트끼리 겹치지 않는 짧은 표식(제목 80자 제한 안). */
export function stamp() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}
