import { z } from "zod";
import { DemoUser, MeOccupancy } from "./auth.ts";
import { BuildingStatus } from "./buildings.ts";

/**
 * 시연 시작(LF-20, 29)의 ‘처음 상태로 되돌리기’ 제한. 누구나 부를 수 있으므로 모든 사람을 합쳐 30초에 한 번,
 * 한 시간에 20번까지입니다. 넘으면 429 `RATE_LIMITED`와 `Retry-After`(남은 초)입니다.
 */
export const DEMO_RESET_INTERVAL_SECONDS = 30;
export const DEMO_RESET_HOURLY_LIMIT = 20;
/**
 * 같은 사람(IP 묶음)의 제한. 모든 사람 합친 제한보다 먼저 세므로, 한 사람이 30초에 한 번·한 시간에 10번을 넘긴
 * 요청은 전체 횟수를 쓰지 않습니다(한 사람이 전체 한도를 혼자 다 쓰지 못함).
 */
export const DEMO_RESET_CLIENT_INTERVAL_SECONDS = 30;
export const DEMO_RESET_CLIENT_HOURLY_LIMIT = 10;

/** 시연 건물의 쓰임. `demo`는 발표 시연(29 역할 전환), `e2e`는 끝까지 해보는 테스트 전용이라 29에 보이지 않습니다. */
export const DEMO_PURPOSES = ["demo", "e2e"] as const;
export const DemoPurpose = z.enum(DEMO_PURPOSES);
export type DemoPurpose = z.infer<typeof DemoPurpose>;

/** `joinCode`: 지금 쓰는 가입코드(시연 건물이라 보여 줌, 없으면 null). `confirmedAt`: 집주인이 건물 확인(23)을 마친 시각. */
export const DemoBuilding = z.object({
  id: z.uuid(),
  name: z.string(),
  status: BuildingStatus,
  confirmedAt: z.iso.datetime().nullable(),
  purpose: DemoPurpose,
  joinCode: z.string().nullable(),
});
export type DemoBuilding = z.infer<typeof DemoBuilding>;

/** 시연 집주인. 관리하는 건물과 ‘확인할 것’(확인 전 메모 + 아직 확인하지 않은 제보) 수. */
export const DemoLandlord = z.object({
  as: DemoUser,
  label: z.string(),
  role: z.literal("landlord"),
  purpose: DemoPurpose,
  buildings: z.array(z.object({ id: z.uuid(), name: z.string() })),
  pendingMemoCount: z.number().int().min(0),
  newReportCount: z.number().int().min(0),
});
export type DemoLandlord = z.infer<typeof DemoLandlord>;

/** 시연 거주자. 살아 있는 연결(없으면 null, 예: 다음 입주자 B)과 내가 남긴 보이는 팁·메모 수. */
export const DemoResident = z.object({
  as: DemoUser,
  label: z.string(),
  role: z.literal("resident"),
  purpose: DemoPurpose,
  occupancy: MeOccupancy.nullable(),
  tipCount: z.number().int().min(0),
  memoCount: z.number().int().min(0),
});
export type DemoResident = z.infer<typeof DemoResident>;

/** 29 역할 전환에 보이는 계정. 고르면 `POST /api/dev/login`의 `as`로 로그인합니다(실제 권한을 만들지 않음). */
export const DemoAccount = z.discriminatedUnion("role", [DemoLandlord, DemoResident]);
export type DemoAccount = z.infer<typeof DemoAccount>;

/**
 * 29 ‘옆 건물 주민(비회원) · 제보 1건 접수됨’. 햇살빌라에 시드한 비회원 제보와 그 확인 링크(`/r/<id>#t=<토큰>`,
 * 시연 전용 고정 토큰). 로그인하지 않은 채 이 주소를 열면 비회원이 보는 제보 상태(30)입니다.
 */
export const DemoGuestReport = z.object({ reportId: z.uuid(), statusPath: z.string() });
export type DemoGuestReport = z.infer<typeof DemoGuestReport>;

/**
 * `GET /api/dev/demo` (DEMO_MODE 전용). 시드하지 않았으면 빈 목록입니다. `guestReport`는 시드한 비회원 제보가
 * 없거나 링크 기한(30일)이 지났으면 null입니다(다시 시드·초기화하면 생김).
 */
export const DemoOverview = z.object({
  buildings: z.array(DemoBuilding),
  accounts: z.array(DemoAccount),
  guestReport: DemoGuestReport.nullable(),
});
export type DemoOverview = z.infer<typeof DemoOverview>;

/**
 * `POST /api/dev/reset` 본문(없어도 됨). `reconfirmRequested`: 입주자 A를 ‘재확인 요청됨’으로 둠(시트 40 시연,
 * `db:seed -- --reset-demo --reconfirm-requested`와 같음, 단 API는 발표 시연 건물 두 곳만 되돌림).
 */
export const DemoResetBody = z.object({ reconfirmRequested: z.boolean().optional() });
export type DemoResetBody = z.infer<typeof DemoResetBody>;

/**
 * 되돌린 시연 건물마다 지우고 다시 만든 행 수. `POST /api/dev/reset`은 발표 시연 건물 두 곳(`purpose: "demo"`,
 * 햇살빌라·새봄하우스)만 되돌리므로 두 건물만 담깁니다. e2e 건물(테스트빌라·준비빌라)은 `db:seed -- --reset-demo`만
 * 되돌립니다.
 */
export const DemoResetBuilding = z.object({
  id: z.uuid(),
  name: z.string(),
  removed: z.object({
    guides: z.number().int().min(0),
    memos: z.number().int().min(0),
    notices: z.number().int().min(0),
    managers: z.number().int().min(0),
    invites: z.number().int().min(0),
    joinCodes: z.number().int().min(0),
    occupancies: z.number().int().min(0),
    reports: z.number().int().min(0),
    tips: z.number().int().min(0),
  }),
});
export type DemoResetBuilding = z.infer<typeof DemoResetBuilding>;

export const DemoResetResult = z.object({ buildings: z.array(DemoResetBuilding) });
export type DemoResetResult = z.infer<typeof DemoResetResult>;
