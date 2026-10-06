import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateGuideBody,
  Guide,
  type GuideRevision,
  GuideRevisionResponse,
  type ManagedBuildingDetail,
  ManagedGuide,
  PublishGuideResult,
  type UpdateGuideBody,
} from "@wolgyeham/contracts";
import { deleteEmpty, getJson, patchJson, postJson, seg } from "../../lib/api";
import { buildingKeys } from "../buildings/queries";
import { memoKeys } from "./memos";

export const guideKeys = {
  detail: (guideId: string) => ["guide", guideId] as const,
  /** 공개된 안내의 아직 공개하지 않은 수정본(집주인). 로그아웃 때 지우도록 manage 아래에 둡니다. */
  revision: (guideId: string) => ["manage", "guides", guideId, "revision"] as const,
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

/**
 * 초안은 바로 고치고, 공개된 안내는 공개 내용을 두고 수정본에 저장합니다(D-12).
 * 응답의 위 필드는 지금 공개된(초안이면 초안) 내용이라 공개 화면 캐시는 그대로 맞습니다.
 */
export function useUpdateGuide(buildingId: string, guideId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateGuideBody) =>
      patchJson(`/api/guides/${seg(guideId)}`, body, ManagedGuide),
    onSuccess: ({ revision, ...guide }) => {
      queryClient.setQueryData(guideKeys.detail(guide.id), guide);
      if (revision) {
        queryClient.setQueryData<GuideRevisionResponse>(guideKeys.revision(guide.id), {
          revision,
        });
      }
      queryClient.setQueryData<ManagedBuildingDetail>(buildingKeys.managed(buildingId), (old) =>
        old
          ? { ...old, guides: old.guides.map((item) => (item.id === guide.id ? guide : item)) }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: buildingKeys.managed(buildingId) });
    },
  });
}

/** 공개된 안내의 저장한 수정본(33·43). 없으면 null. */
export function useGuideRevision(guideId: string, enabled = true) {
  return useQuery({
    queryKey: guideKeys.revision(guideId),
    queryFn: () => getJson(`/api/guides/${seg(guideId)}/revision`, GuideRevisionResponse),
    select: (data): GuideRevision | null => data.revision,
    enabled,
  });
}

/** 편집 취소: 수정본만 지웁니다. 공개 내용과 메모 상태는 그대로입니다. */
export function useDiscardRevision(guideId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => discardRevision(guideId),
    onSuccess: () => {
      queryClient.setQueryData<GuideRevisionResponse>(guideKeys.revision(guideId), {
        revision: null,
      });
    },
  });
}

/** 공개·수정 공개 요청. 본문은 항상 `{ applyMemoIds }`입니다(첫 공개는 빈 목록). */
export function publishGuide(guideId: string, applyMemoIds: readonly string[]) {
  return postJson(
    `/api/guides/${seg(guideId)}/publish`,
    { applyMemoIds: [...applyMemoIds] },
    PublishGuideResult,
  );
}

/** 편집 취소: 수정본만 지웁니다(204, 없어도 성공). */
export function discardRevision(guideId: string) {
  return deleteEmpty(`/api/guides/${seg(guideId)}/revision`);
}

/**
 * 공개(43)와 수정 공개. `applyMemoIds`는 이번 수정으로 반영하는 확인 전 메모이고, 공개와 같은
 * 트랜잭션에서 ‘반영됨’이 됩니다. 실패하면 공개 내용·수정본·메모 상태가 모두 그대로입니다.
 */
export function usePublishGuide(buildingId: string, guideId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applyMemoIds: readonly string[]) => publishGuide(guideId, applyMemoIds),
    onSuccess: (result) => {
      queryClient.setQueryData(guideKeys.detail(result.guide.id), result.guide);
      queryClient.setQueryData<GuideRevisionResponse>(guideKeys.revision(result.guide.id), {
        revision: null,
      });
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
      if (result.appliedMemoIds.length > 0) {
        void queryClient.invalidateQueries({ queryKey: memoKeys.all() });
        for (const memoId of result.appliedMemoIds) {
          void queryClient.invalidateQueries({ queryKey: memoKeys.detail(memoId) });
        }
      }
    },
  });
}
