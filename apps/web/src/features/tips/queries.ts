import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ContentReportResult,
  type CreateTipBody,
  MyTipList,
  Tip,
  TipList,
  type UpdateTipBody,
} from "@wolgyeham/contracts";
import { deleteEmpty, getJson, patchJson, postJson, seg } from "../../lib/api";

// 생활 팁(LF-06·07). 응답의 `mine`이 사람마다 달라 키에 사용자 id를 둡니다(계정을 바꿔도 섞이지 않음).

export const tipKeys = {
  all: () => ["tips"] as const,
  building: (buildingId: string, userId: string) =>
    ["tips", "building", buildingId, userId] as const,
  mine: (userId: string) => ["tips", "mine", userId] as const,
};

/** 이 건물의 보이는 팁(최근 순). 읽기는 active·reconfirm_needed 거주자와 집주인. 연결 전이면 403 NOT_CONNECTED. */
export function useTips(buildingId: string, userId: string | undefined) {
  return useQuery({
    queryKey: tipKeys.building(buildingId, userId ?? ""),
    queryFn: () => getJson(`/api/buildings/${seg(buildingId)}/tips`, TipList),
    select: (data) => data.tips,
    enabled: Boolean(userId) && buildingId !== "",
  });
}

/** 내가 남긴 팁(모든 건물). 가린 팁은 `hidden`, 지금 그 건물과 연결돼 있으면 `editable`. */
export function useMyTips(userId: string | undefined) {
  return useQuery({
    queryKey: tipKeys.mine(userId ?? ""),
    queryFn: () => getJson("/api/me/tips", MyTipList),
    select: (data) => data.tips,
    enabled: Boolean(userId),
  });
}

function useInvalidateTips() {
  const queryClient = useQueryClient();
  // 팁 목록·내 팁·관리 홈의 팁 수를 함께 새로 받습니다.
  return () => {
    void queryClient.invalidateQueries({ queryKey: tipKeys.all() });
    void queryClient.invalidateQueries({ queryKey: ["manage", "buildings"] });
  };
}

/** 생활 팁 남기기(19). active 거주자만. 자동으로 다시 보내지 않습니다. */
export function useCreateTip(buildingId: string) {
  const invalidate = useInvalidateTips();
  return useMutation({
    mutationFn: (body: CreateTipBody) =>
      postJson(`/api/buildings/${seg(buildingId)}/tips`, body, Tip),
    onSuccess: invalidate,
  });
}

/** 본인 팁 고치기. 보낸 필드만 바뀝니다. 이사한 뒤에는 403 NOT_CONNECTED. */
export function useUpdateTip(tipId: string) {
  const invalidate = useInvalidateTips();
  return useMutation({
    mutationFn: (body: UpdateTipBody) => patchJson(`/api/tips/${seg(tipId)}`, body, Tip),
    onSuccess: invalidate,
  });
}

/** 본인 팁 지우기(204). */
export function useDeleteTip() {
  const invalidate = useInvalidateTips();
  return useMutation({
    mutationFn: (tipId: string) => deleteEmpty(`/api/tips/${seg(tipId)}`),
    onSuccess: invalidate,
  });
}

/** 팁 신고. 다시 하면 `alreadyReported: true`. 가린 팁은 404, 본인 팁은 403. */
export function useReportTip() {
  return useMutation({
    mutationFn: ({ tipId, reason }: { tipId: string; reason: string }) =>
      postJson(
        `/api/tips/${seg(tipId)}/content-reports`,
        reason ? { reason } : {},
        ContentReportResult,
      ),
  });
}
