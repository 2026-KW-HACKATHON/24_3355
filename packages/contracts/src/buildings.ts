import { z } from "zod";
import { Guide } from "./guides.ts";

export const BUILDING_STATUSES = ["preparing", "open"] as const;
export const BuildingStatus = z.enum(BUILDING_STATUSES);
export type BuildingStatus = z.infer<typeof BuildingStatus>;

export const BuildingParams = z.object({ buildingId: z.uuid() });
export type BuildingParams = z.infer<typeof BuildingParams>;

/** 공개 응답. 주소는 도로명까지(`displayAddress`)만 담습니다. preparing이면 공개 안내가 없습니다(LF-14). */
export const PublicBuilding = z.object({
  id: z.uuid(),
  name: z.string(),
  displayAddress: z.string(),
  status: BuildingStatus,
});
export type PublicBuilding = z.infer<typeof PublicBuilding>;

/** 관리자에게만 보이는 건물 정보. `fullAddress`는 팀이 확인한 주소입니다(LF-23). */
export const ManagedBuilding = PublicBuilding.extend({
  fullAddress: z.string(),
  openedAt: z.iso.datetime().nullable(),
});
export type ManagedBuilding = z.infer<typeof ManagedBuilding>;

export const ManagedBuildingSummary = ManagedBuilding.extend({
  publishedGuideCount: z.number().int().min(0),
  draftGuideCount: z.number().int().min(0),
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
