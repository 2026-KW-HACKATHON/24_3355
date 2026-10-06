import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateGuideBody,
  Guide,
  type ManagedBuildingDetail,
  PublishGuideResult,
  type UpdateGuideBody,
} from "@wolgyeham/contracts";
import { getJson, patchJson, postJson, seg } from "../../lib/api";
import { buildingKeys } from "../buildings/queries";

export const guideKeys = {
  detail: (guideId: string) => ["guide", guideId] as const,
};

/** 공개는 published만, 그 건물 집주인은 draft도 받습니다. */
export function useGuide(guideId: string, enabled = true) {
  return useQuery({
    queryKey: guideKeys.detail(guideId),
    queryFn: () => getJson(`/api/guides/${seg(guideId)}`, Guide),
    enabled,
  });
}

export function useCreateGuide(buildingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGuideBody) =>
      postJson(`/api/buildings/${seg(buildingId)}/guides`, body, Guide),
    onSuccess: (guide) => {
      queryClient.setQueryData(guideKeys.detail(guide.id), guide);
      // 미리 보기(43)가 새 초안을 바로 찾도록 관리 캐시에 먼저 넣습니다.
      queryClient.setQueryData<ManagedBuildingDetail>(buildingKeys.managed(buildingId), (old) =>
        old
          ? { ...old, guides: [...old.guides.filter((item) => item.id !== guide.id), guide] }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: buildingKeys.managed(buildingId) });
      void queryClient.invalidateQueries({ queryKey: buildingKeys.managedList() });
    },
  });
}

export function useUpdateGuide(buildingId: string, guideId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateGuideBody) => patchJson(`/api/guides/${seg(guideId)}`, body, Guide),
    onSuccess: (guide) => {
      queryClient.setQueryData(guideKeys.detail(guide.id), guide);
      queryClient.setQueryData<ManagedBuildingDetail>(buildingKeys.managed(buildingId), (old) =>
        old
          ? { ...old, guides: old.guides.map((item) => (item.id === guide.id ? guide : item)) }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: buildingKeys.managed(buildingId) });
    },
  });
}

export function usePublishGuide(buildingId: string, guideId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      postJson(`/api/guides/${seg(guideId)}/publish`, undefined, PublishGuideResult),
    onSuccess: (result) => {
      queryClient.setQueryData(guideKeys.detail(result.guide.id), result.guide);
      // 다음 화면(38·42)이 바로 맞는 개수를 보이도록 캐시를 먼저 고치고, 뒤에서 다시 받습니다.
      queryClient.setQueryData<ManagedBuildingDetail>(buildingKeys.managed(buildingId), (old) =>
        old
          ? {
              building: result.buildingOpened ? { ...old.building, status: "open" } : old.building,
              guides: old.guides.map((guide) =>
                guide.id === result.guide.id ? result.guide : guide,
              ),
            }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: buildingKeys.managed(buildingId) });
      void queryClient.invalidateQueries({ queryKey: buildingKeys.managedList() });
      void queryClient.invalidateQueries({ queryKey: buildingKeys.public(buildingId) });
    },
  });
}
