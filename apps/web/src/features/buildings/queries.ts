import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ConfirmManagedBuildingBody,
  CurrentJoinCode,
  GuideList,
  JoinCode,
  ManagedBuilding,
  ManagedBuildingDetail,
  ManagedBuildingList,
  PublicBuilding,
} from "@wolgyeham/contracts";
import { getJson, postJson, seg } from "../../lib/api";
import { fillConfirmedAt, fillManagedDetail, fillManagedList, tolerant } from "../../lib/apiCompat";
import { authKeys } from "../auth/queries";

export const buildingKeys = {
  public: (buildingId: string) => ["building", buildingId] as const,
  guides: (buildingId: string) => ["building", buildingId, "guides"] as const,
  managedList: () => ["manage", "buildings"] as const,
  managed: (buildingId: string) => ["manage", "buildings", buildingId] as const,
  joinCode: (buildingId: string) => ["manage", "buildings", buildingId, "join-code"] as const,
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

// `confirmedAt`(23)이 없는 이전 API의 관리 응답도 받습니다(lib/apiCompat, 배포 한 번 동안).
const ManagedListCompat = tolerant(ManagedBuildingList, fillManagedList);
const ManagedDetailCompat = tolerant(ManagedBuildingDetail, fillManagedDetail);
const ManagedBuildingCompat = tolerant(ManagedBuilding, fillConfirmedAt);

export function useManagedBuildings(enabled: boolean) {
  return useQuery({
    queryKey: buildingKeys.managedList(),
    queryFn: () => getJson("/api/manage/buildings", ManagedListCompat),
    select: (data) => data.buildings,
    enabled,
  });
}

/** 집주인 화면(LF-13·14): 건물과 초안을 포함한 모든 안내. */
export function useManagedBuilding(buildingId: string, enabled = true) {
  return useQuery({
    queryKey: buildingKeys.managed(buildingId),
    queryFn: () => getJson(`/api/manage/buildings/${seg(buildingId)}`, ManagedDetailCompat),
    enabled,
  });
}

/** 집주인이 보는 현재 가입코드(LF-18). 아직 만들지 않았으면 null. */
export function useJoinCode(buildingId: string) {
  return useQuery({
    queryKey: buildingKeys.joinCode(buildingId),
    queryFn: () => getJson(`/api/buildings/${seg(buildingId)}/join-code`, CurrentJoinCode),
    select: (data) => data.joinCode,
  });
}

/** 가입코드 만들기·바꾸기. 이전 코드는 끝나고 이미 연결된 거주자는 그대로입니다. */
export function useRotateJoinCode(buildingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postJson(`/api/buildings/${seg(buildingId)}/join-code`, undefined, JoinCode),
    onSuccess: (joinCode) => {
      queryClient.setQueryData<CurrentJoinCode>(buildingKeys.joinCode(buildingId), { joinCode });
    },
  });
}

/**
 * 건물 확인(LF-12·23 ‘맞아요’). 이름을 고쳤으면 함께 보냅니다. 처음 확인한 시각만 남고 다시 불러도 성공합니다.
 * 이름이 바뀌었을 수 있으니 관리 화면·공개 화면·내 정보(관리하는 건물 이름)를 새로 받습니다.
 */
export function useConfirmBuilding(buildingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ConfirmManagedBuildingBody) =>
      postJson(`/api/manage/buildings/${seg(buildingId)}/confirm`, body, ManagedBuildingCompat),
    onSuccess: (building) => {
      queryClient.setQueryData<ManagedBuildingDetail>(buildingKeys.managed(buildingId), (old) =>
        old ? { ...old, building } : old,
      );
      void queryClient.invalidateQueries({ queryKey: buildingKeys.managedList() });
      void queryClient.invalidateQueries({ queryKey: buildingKeys.public(buildingId) });
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}
