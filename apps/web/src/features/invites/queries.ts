import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AcceptManagerInviteResult, ManagerInvitePreview } from "@wolgyeham/contracts";
import { postJson } from "../../lib/api";
import { authKeys } from "../auth/queries";

// 초대 토큰은 웹 주소의 #t= 뒤에만 두고, 로그인을 거치는 동안 sessionStorage에 옮겨 둡니다(frontend.md §5).
const KEY = "wh.inviteToken";

export function readInviteHash(hash: string): string | undefined {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("t")?.trim();
  return token ? token : undefined;
}

export function stashInviteToken(token: string) {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // 저장하지 못하면 주소의 토큰만 씁니다.
  }
}

export function loadInviteToken(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function clearInviteToken() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}

/** 로그인 전에도 건물 이름을 보여줍니다(lofi 41). 토큰은 본문으로만 보냅니다. */
export function useInvitePreview(token: string | undefined) {
  return useQuery({
    queryKey: ["invite", "preview", token],
    queryFn: () =>
      postJson("/api/manager-invites/preview", { token: token ?? "" }, ManagerInvitePreview),
    enabled: token !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      postJson("/api/manager-invites/accept", { token }, AcceptManagerInviteResult),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
      void queryClient.invalidateQueries({ queryKey: ["manage"] });
    },
  });
}
