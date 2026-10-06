import { z } from "zod";
import { Guide } from "./guides.ts";

export const BUILDING_STATUSES = ["preparing", "open"] as const;
export const BuildingStatus = z.enum(BUILDING_STATUSES);
export type BuildingStatus = z.infer<typeof BuildingStatus>;

export const BuildingParams = z.object({ buildingId: z.uuid() });
export type BuildingParams = z.infer<typeof BuildingParams>;

/** 건물 이름 글자 수(LF-12·23). 현관 QR을 연 사람이 가장 먼저 보는 이름입니다. */
export const BUILDING_NAME_MAX = 40;

/**
 * 집주인이 정하는 건물 이름. 앞뒤 공백을 지운 뒤 1~40자, 한 줄입니다. 보이지 않거나 글자 방향을 바꾸는 문자는
 * 받지 않습니다: 제어문자(Cc), 서식 문자(Cf: 방향 표시 LRM·RLM·ALM, 방향 제어 U+202A–202E·2066–2069, 폭 없는
 * 문자 U+200B–200D·2060, BOM, 태그 문자 U+E0000–E007F 등), 사용자 정의(Co)·배정되지 않은(Cn)·짝 없는 서로게이트(Cs)
 * 문자, 줄/문단 구분자(U+2028·2029). 결합 문자는 세 개 이상 잇달아 쓸 수 없고(글자 위아래로 넘치는 이름 방지),
 * 한글 채움 문자(U+115F·1160·3164·FFA0)가 아닌 글자나 숫자가 하나는 있어야 합니다(보이지 않는 이름 방지).
 */
export const BuildingName = z
  .string()
  .trim()
  .min(1)
  .max(BUILDING_NAME_MAX)
  .regex(/^[^\p{C}\p{Zl}\p{Zp}]*$/u, "invisible or control characters are not allowed")
  .refine((value) => !/\p{M}{3}/u.test(value), "too many combining marks in a row")
  .regex(/(?![ᅟᅠㅤﾠ])[\p{L}\p{N}]/u, "must contain a visible letter or digit");

/** 건물 이름 고치기(`PATCH /manage/buildings/:buildingId`). 주소는 팀이 확인한 값이라 바꾸지 않습니다. */
export const UpdateManagedBuildingBody = z.object({ name: BuildingName });
export type UpdateManagedBuildingBody = z.infer<typeof UpdateManagedBuildingBody>;

/**
 * 건물 확인(LF-12·23 ‘맞아요, 안내 쓰기’, `POST /manage/buildings/:buildingId/confirm`). 이름을 고쳤으면 함께
 * 보냅니다. 처음 확인한 시각만 남기고 다시 불러도 성공합니다.
 */
export const ConfirmManagedBuildingBody = z.object({ name: BuildingName.optional() });
export type ConfirmManagedBuildingBody = z.infer<typeof ConfirmManagedBuildingBody>;

/** 공개 응답. 주소는 도로명까지(`displayAddress`)만 담습니다. preparing이면 공개 안내가 없습니다(LF-14). */
export const PublicBuilding = z.object({
  id: z.uuid(),
  name: z.string(),
  displayAddress: z.string(),
  status: BuildingStatus,
});
export type PublicBuilding = z.infer<typeof PublicBuilding>;

/**
 * 관리자에게만 보이는 건물 정보. `fullAddress`는 팀이 확인한 주소입니다(LF-23). `confirmedAt`은 집주인이 건물
 * 확인(LF-12·23)을 처음 마친 시각이고, null이면 초대를 수락한 뒤 아직 확인하지 않았습니다(웹은 33 전에 23).
 */
export const ManagedBuilding = PublicBuilding.extend({
  fullAddress: z.string(),
  openedAt: z.iso.datetime().nullable(),
  confirmedAt: z.iso.datetime().nullable(),
});
export type ManagedBuilding = z.infer<typeof ManagedBuilding>;

export const ManagedBuildingSummary = ManagedBuilding.extend({
  publishedGuideCount: z.number().int().min(0),
  draftGuideCount: z.number().int().min(0),
  /** 확인 전(`pending`) 수정 메모 수. 관리 홈의 ‘확인할 것’(LF-13). */
  pendingMemoCount: z.number().int().min(0),
  /** 아직 ‘확인했어요’를 누르지 않은(`received`) 제보 수. 관리 홈의 ‘확인할 것’과 받은 내용 탭(LF-13·16). */
  newReportCount: z.number().int().min(0),
  /** 거주자에게 보이는(운영팀이 가리지 않은) 생활 팁 수. 관리 홈의 ‘지금 건물에 보이는 것’(LF-13). */
  tipCount: z.number().int().min(0),
});
export type ManagedBuildingSummary = z.infer<typeof ManagedBuildingSummary>;

export const ManagedBuildingList = z.object({ buildings: z.array(ManagedBuildingSummary) });
export type ManagedBuildingList = z.infer<typeof ManagedBuildingList>;

/** 관리 화면(LF-13·14·23): 건물과 초안을 포함한 모든 안내(position 순). */
export const ManagedBuildingDetail = z.object({
  building: ManagedBuilding,
  guides: z.array(Guide),
});
export type ManagedBuildingDetail = z.infer<typeof ManagedBuildingDetail>;

/** 초대 토큰은 웹 URL의 `#t=` 뒤에만 두고, API에는 본문으로 보냅니다. */
export const ManagerInviteBody = z.object({ token: z.string().min(16).max(128) });
export type ManagerInviteBody = z.infer<typeof ManagerInviteBody>;

export const ManagerInvitePreview = z.object({ buildingName: z.string() });
export type ManagerInvitePreview = z.infer<typeof ManagerInvitePreview>;

/** `alreadyManager`: 이미 이 건물 관리자라서 초대 상태를 바꾸지 않았음. 웹은 관리 홈으로 이동합니다. */
export const AcceptManagerInviteResult = z.object({
  buildingId: z.uuid(),
  alreadyManager: z.boolean(),
});
export type AcceptManagerInviteResult = z.infer<typeof AcceptManagerInviteResult>;
