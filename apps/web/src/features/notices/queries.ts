import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateNoticeBody,
  CreateNoticeResult,
  Notice,
  NoticeAudience,
  NoticeList,
} from "@wolgyeham/contracts";
import { getJson, postEmpty, postJson, seg } from "../../lib/api";

export const noticeKeys = {
  list: (buildingId: string) => ["building", buildingId, "notices"] as const,
  detail: (noticeId: string) => ["notice", noticeId] as const,
  audience: (buildingId: string) => ["manage", "buildings", buildingId, "audience"] as const,
};

/** 끝나지 않은 공지만, 최근에 올린 순서. 끝난 공지는 서버가 빼고 보냅니다. */
export function useNotices(buildingId: string) {
  return useQuery({
    queryKey: noticeKeys.list(buildingId),
    queryFn: () => getJson(`/api/buildings/${seg(buildingId)}/notices`, NoticeList),
    select: (data) => data.notices,
  });
}

/** 공지 상세(LF-03). 끝난 공지는 410 NOTICE_ENDED로 옵니다. */
export function useNotice(noticeId: string) {
  return useQuery({
    queryKey: noticeKeys.detail(noticeId),
    queryFn: () => getJson(`/api/notices/${seg(noticeId)}`, Notice),
  });
}

/**
 * 공지 열람 기록(발송 결과의 opened). 로그인한 거주자가 상세를 열 때 한 번 보냅니다.
 * 알림 대상이 아니었어도 서버는 204이고, 실패해도 화면에는 알리지 않습니다.
 */
export function recordNoticeOpened(noticeId: string): Promise<void> {
  return postEmpty(`/api/notices/${seg(noticeId)}/opened`);
}

/** 공지 올리기(34)의 대상 수: 월계함에 연결된 거주자와 그중 알림을 켠 사람. */
export function useNoticeAudience(buildingId: string) {
  return useQuery({
    queryKey: noticeKeys.audience(buildingId),
    queryFn: () => getJson(`/api/buildings/${seg(buildingId)}/notices/audience`, NoticeAudience),
  });
}

export function useCreateNotice(buildingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateNoticeBody) =>
      postJson(`/api/buildings/${seg(buildingId)}/notices`, body, CreateNoticeResult),
    onSuccess: (result) => {
      queryClient.setQueryData(noticeKeys.detail(result.notice.id), result.notice);
      void queryClient.invalidateQueries({ queryKey: noticeKeys.list(buildingId) });
    },
  });
}
