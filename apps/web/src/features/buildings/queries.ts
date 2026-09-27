import { useQuery } from "@tanstack/react-query";
import {
  CurrentNoticeResponse,
  GuideList,
  ManagedBuildingDetail,
  ManagedBuildingList,
  PublicBuilding,
} from "@wolgyeham/contracts";
import { getJson, seg } from "../../lib/api";

export const buildingKeys = {
  public: (buildingId: string) => ["building", buildingId] as const,
  guides: (buildingId: string) => ["building", buildingId, "guides"] as const,
  notice: (buildingId: string) => ["building", buildingId, "notice"] as const,
  managedList: () => ["manage", "buildings"] as const,
  managed: (buildingId: string) => ["manage", "buildings", buildingId] as const,
};

/** LF-01 건물 이름·도로명 주소·상태. 없는 건물은 NOT_FOUND, 잘못된 id는 VALIDATION_FAILED. */
export function usePublicBuilding(buildingId: string) {
  return useQuery({
    queryKey: buildingKeys.public(buildingId),
    queryFn: () => getJson(`/api/buildings/${seg(buildingId)}`, PublicBuilding),
  });
}

/** 공개된 안내만, position 순서, 본문 전체. preparing 건물은 빈 목록입니다. */
export function usePublicGuides(buildingId: string) {
  return useQuery({
    queryKey: buildingKeys.guides(buildingId),
    queryFn: () => getJson(`/api/buildings/${seg(buildingId)}/guides`, GuideList),
    select: (data) => data.guides.filter((guide) => guide.status === "published"),
  });
}

export function useCurrentNotice(buildingId: string) {
  return useQuery({
    queryKey: buildingKeys.notice(buildingId),
    queryFn: () =>
      getJson(`/api/buildings/${seg(buildingId)}/notices/current`, CurrentNoticeResponse),
    select: (data) => data.notice,
  });
}

export function useManagedBuildings(enabled: boolean) {
  return useQuery({
    queryKey: buildingKeys.managedList(),
    queryFn: () => getJson("/api/manage/buildings", ManagedBuildingList),
    select: (data) => data.buildings,
    enabled,
  });
}

/** 집주인 화면(LF-13·14): 건물과 초안을 포함한 모든 안내. */
export function useManagedBuilding(buildingId: string, enabled = true) {
  return useQuery({
    queryKey: buildingKeys.managed(buildingId),
    queryFn: () => getJson(`/api/manage/buildings/${seg(buildingId)}`, ManagedBuildingDetail),
    enabled,
  });
}
