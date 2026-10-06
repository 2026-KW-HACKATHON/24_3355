import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AcceptManagerInviteResult, ManagerInvitePreview } from "@wolgyeham/contracts";
import { postJson } from "../../lib/api";
import { type AppErrorCode, toAppError } from "../../lib/errors";
import { authKeys } from "../auth/queries";
import { clearInviteToken } from "./token";

// 다시 보내도 결과가 같은 실패. 없음·수락됨(404), 기간 지남(410), 다른 계정이 먼저 수락(409), 잘못된 토큰(400).
// 연결 문제·서버 오류·요청 많음·로그인 만료는 다시 시도할 수 있으니 토큰을 남깁니다.
const DEAD_INVITE: ReadonlySet<AppErrorCode> = new Set([
  "NOT_FOUND",
  "INVITE_EXPIRED",
  "CONFLICT",
  "VALIDATION_FAILED",
  "FORBIDDEN",
]);

export function isDeadInvite(error: unknown): boolean {
  return DEAD_INVITE.has(toAppError(error).code);
}

/** 쓸 수 없는 초대로 판정되면 저장한 토큰을 지워, 다음에 이 화면을 열 때 같은 실패를 반복하지 않게 합니다. */
async function forgetDeadInvite<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (isDeadInvite(error)) clearInviteToken();
    throw error;
  }
}

export function previewInvite(token: string) {
  return forgetDeadInvite(
    postJson("/api/manager-invites/preview", { token }, ManagerInvitePreview),
  );
}

export function acceptInvite(token: string) {
  return forgetDeadInvite(
    postJson("/api/manager-invites/accept", { token }, AcceptManagerInviteResult),
  );
}

/** 로그인 전에도 건물 이름을 보여줍니다(lofi 41). 토큰은 본문으로만 보냅니다. */
export function useInvitePreview(token: string | undefined) {
  return useQuery({
    queryKey: ["invite", "preview", token],
    queryFn: () => previewInvite(token ?? ""),
    enabled: token !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptInvite,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
      void queryClient.invalidateQueries({ queryKey: ["manage"] });
    },
  });
}
