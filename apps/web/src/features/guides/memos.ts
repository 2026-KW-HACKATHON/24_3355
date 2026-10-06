import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CORRECTION_MEMO_BODY_MAX,
  CORRECTION_MEMO_REASON_MAX,
  type CorrectionMemo,
  type CorrectionMemoStatus,
  GuideCorrectionMemo,
  GuideCorrectionMemoList,
  ManagedCorrectionMemo,
  ManagedCorrectionMemoList,
  type Me,
} from "@wolgyeham/contracts";
import { getJson, postJson, seg } from "../../lib/api";
import { formatDay } from "../../lib/format";
import { cleanText } from "../../lib/text";
import { buildingKeys } from "../buildings/queries";
import { reconfirmState } from "../occupancy/reconfirm";

// 수정 메모(LF-02 12·13, LF-17 25). 작성자는 누구에게도 보이지 않고, 거주자 응답에는 내가 쓴 메모인지(mine)만 옵니다.

export const memoKeys = {
  /** 거주자가 보는 안내 아래 메모. 사람마다 `mine`이 달라 로그아웃·계정 전환 때 지웁니다. */
  all: () => ["memos"] as const,
  guide: (guideId: string) => ["memos", "guide", guideId] as const,
  /** 집주인의 건물 메모 목록. 관리 캐시(`manage`) 아래라 로그아웃 때 함께 지워집니다. */
  building: (buildingId: string, status?: CorrectionMemoStatus) =>
    ["manage", "buildings", buildingId, "memos", status ?? "all"] as const,
  detail: (memoId: string) => ["manage", "memos", memoId] as const,
};

/** 상태 배지. 색과 글자를 함께 씁니다(frontend.md §7). */
export const MEMO_STATUS: Readonly<
  Record<CorrectionMemoStatus, { label: string; badge: "gray" | "done" | "navy" }>
> = {
  pending: { label: "집주인 확인 전", badge: "gray" },
  applied: { label: "반영됨", badge: "done" },
  kept: { label: "기존 유지", badge: "navy" },
};

/** 메모 아래 한 줄: 집주인이 어떻게 했는지. 유지면 사유를 함께 둡니다(사유는 필수라 항상 있음). */
export function memoOutcome(memo: Pick<CorrectionMemo, "status" | "resolvedAt">): string {
  if (memo.status === "applied") {
    return memo.resolvedAt
      ? `${formatDay(memo.resolvedAt)}에 기본 안내에 반영했어요`
      : "기본 안내에 반영했어요";
  }
  if (memo.status === "kept") return "집주인이 기존 안내를 그대로 두기로 했어요";
  return "집주인이 확인하기 전까지 기본 안내는 그대로예요";
}

/**
 * 안내를 보는 사람과 건물의 관계(LF-02 메모 자리). `/me`의 연결은 살아 있는 것(active·reconfirm_needed)만 옵니다.
 * 집주인은 메모를 쓰지 않고(서버 403) 관리 화면에서 고칩니다. 권한은 서버가 요청마다 다시 확인합니다.
 */
export function memoAccess(me: Me | null | undefined, buildingId: string) {
  const resident = me?.occupancy?.buildingId === buildingId ? me.occupancy : undefined;
  const manager = Boolean(me?.managedBuildings.some((item) => item.id === buildingId));
  const reconfirm = reconfirmState(resident);
  const canWrite = Boolean(resident) && !manager && reconfirm !== "needed";
  return { resident, manager, reconfirm, canWrite };
}

export type PreparedText = { ok: true; text: string } | { ok: false; reason: "empty" | "long" };

function prepare(value: string, multiline: boolean, max: number): PreparedText {
  const text = cleanText(value, { multiline }).trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > max) return { ok: false, reason: "long" };
  return { ok: true, text };
}

/** 보낼 메모(12): 여러 줄, 제어문자 빼고 앞뒤 공백 없이 200자 안(contracts CreateCorrectionMemoBody). */
export function prepareMemoBody(value: string): PreparedText {
  return prepare(value, true, CORRECTION_MEMO_BODY_MAX);
}

/** 기존 유지 사유(25): 한 줄, 줄바꿈은 공백으로(contracts KeepCorrectionMemoBody). */
export function prepareKeepReason(value: string): PreparedText {
  return prepare(value, false, CORRECTION_MEMO_REASON_MAX);
}

/** 이 건물 거주자(active·reconfirm_needed)와 집주인이 읽습니다. */
export function useGuideMemos(guideId: string, enabled: boolean) {
  return useQuery({
    queryKey: memoKeys.guide(guideId),
    queryFn: () => getJson(`/api/guides/${seg(guideId)}/correction-memos`, GuideCorrectionMemoList),
    select: (data) => data.memos,
    enabled,
  });
}

/** 내용이 달라요(12). 쓰기는 이 건물 active 거주자만. 자동으로 다시 보내지 않습니다. */
export function useCreateMemo(guideId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      postJson(`/api/guides/${seg(guideId)}/correction-memos`, { body }, GuideCorrectionMemo),
    onSuccess: (memo) => {
      queryClient.setQueryData<GuideCorrectionMemoList>(memoKeys.guide(guideId), (old) =>
        old ? { memos: [memo, ...old.memos.filter((item) => item.id !== memo.id)] } : old,
      );
      void queryClient.invalidateQueries({ queryKey: memoKeys.guide(guideId) });
    },
  });
}

/** 집주인: 건물의 메모(확인 전 먼저). 관리 홈 ‘확인할 것’은 `pending`. */
export function useBuildingMemos(
  buildingId: string,
  status?: CorrectionMemoStatus,
  enabled = true,
) {
  const query = status ? `?status=${status}` : "";
  return useQuery({
    queryKey: memoKeys.building(buildingId, status),
    queryFn: () =>
      getJson(
        `/api/buildings/${seg(buildingId)}/correction-memos${query}`,
        ManagedCorrectionMemoList,
      ),
    select: (data) => data.memos,
    enabled,
  });
}

/** 집주인: 메모 하나(25). */
export function useCorrectionMemo(memoId: string) {
  return useQuery({
    queryKey: memoKeys.detail(memoId),
    queryFn: () => getJson(`/api/correction-memos/${seg(memoId)}`, ManagedCorrectionMemo),
  });
}

/** 기존 안내 유지(25). 사유는 필수이고, 이미 반영·유지한 메모면 409 CONFLICT입니다. */
export function useKeepMemo(memoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      postJson(`/api/correction-memos/${seg(memoId)}/keep`, { reason }, ManagedCorrectionMemo),
    onSuccess: (memo) => {
      queryClient.setQueryData(memoKeys.detail(memo.id), memo);
      // 관리 홈의 확인 전 수(pendingMemoCount)와 메모 목록을 다시 받습니다.
      void queryClient.invalidateQueries({ queryKey: buildingKeys.managedList() });
      void queryClient.invalidateQueries({ queryKey: memoKeys.guide(memo.guideId) });
    },
  });
}
