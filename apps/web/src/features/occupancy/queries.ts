import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type ConnectBody,
  ConnectResult,
  JoinCodeCheckResult,
  type Me,
  OccupancyResult,
} from "@wolgyeham/contracts";
import { postJson, seg } from "../../lib/api";
import { authKeys } from "../auth/queries";

/** 가입코드 확인(1/2). 로그인 전에 부르고, 틀린 횟수 말고는 아무것도 바꾸지 않습니다. */
export function useCheckJoinCode(buildingId: string) {
  return useMutation({
    mutationFn: (code: string) =>
      postJson(`/api/buildings/${seg(buildingId)}/join-code/check`, { code }, JoinCodeCheckResult),
  });
}

/** 연결(2/2). 코드를 서버가 다시 확인합니다. 다른 건물에서 옮길 때만 replaceOccupancyId를 보냅니다. */
export function useConnect(buildingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ConnectBody) =>
      postJson(`/api/buildings/${seg(buildingId)}/occupancies`, body, ConnectResult),
    // 다시 받는 것을 기다리지 않습니다. 기다리면 mutateAsync가 늦게 끝나 ‘이미 연결돼 있어요’가 번쩍입니다.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

/**
 * ‘아직 살아요’(40). active로 돌리고 확인 시각을 새로 적습니다. 내 정보 캐시를 바로 고쳐
 * 배너·재확인 필요 표시가 곧바로 사라지게 하고, 뒤에서 다시 받습니다.
 */
export function useReconfirm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (occupancyId: string) =>
      postJson(`/api/occupancies/${seg(occupancyId)}/reconfirm`, undefined, OccupancyResult),
    onSuccess: ({ occupancy }) => {
      queryClient.setQueryData<Me | null>(authKeys.me(), (old) =>
        old?.occupancy?.id === occupancy.id
          ? { ...old, occupancy: { ...old.occupancy, ...occupancy } }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

/**
 * ‘이사했어요’(08). 연결을 끝냅니다(inactive). 내 정보 캐시는 연결 종료 화면(09)이 열린 뒤 비웁니다.
 * 먼저 비우면 지금 화면이 ‘연결한 건물이 없어요’로 한 번 바뀐 뒤 넘어갑니다.
 */
export function useMoveOut() {
  return useMutation({
    mutationFn: (occupancyId: string) =>
      postJson(`/api/occupancies/${seg(occupancyId)}/move-out`, undefined, OccupancyResult),
  });
}
