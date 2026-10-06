import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type DevLoginBody, type Me, TERMS_VERSION } from "@wolgyeham/contracts";
import { forgetSubscription, subscriptionEndpoint } from "../push/push";
import { agreeToTerms, demoLogin, fetchDemoLoginAvailable, fetchMe, logout } from "./session";

export const authKeys = {
  me: () => ["me"] as const,
  demo: () => ["dev", "login"] as const,
};

export function useMe() {
  return useQuery({ queryKey: authKeys.me(), queryFn: fetchMe });
}

/** 시연용 로그인 버튼은 서버가 그 경로를 열어 둔 환경에서만 보입니다. */
export function useDemoLoginAvailable(enabled = true) {
  return useQuery({
    queryKey: authKeys.demo(),
    queryFn: fetchDemoLoginAvailable,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

/**
 * 계정마다 내용이 다른 캐시(관리 화면·수정 메모·보낸 제보·팁·집주인이 받는 안내 초안). 로그아웃·계정 전환 때
 * 비웁니다. 남겨 두면 뒤로 가기로 이전 계정의 제보 상세·초안이 보입니다(리뷰 H1).
 */
export const ACCOUNT_QUERY_KEYS = [
  ["manage"],
  ["memos"],
  ["reports"],
  ["tips"],
  ["guide"],
] as const;

/**
 * 시연용 로그인(계정 전환). 새 계정으로 다시 받도록 계정별 캐시를 처음 상태로 되돌립니다.
 * 동의를 받은 곳(16·29)은 `{ as, consent }`로 약관 판을 함께 보냅니다(D-28).
 */
export function demoLoginMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (input: DevLoginBody["as"] | DevLoginBody) =>
      demoLogin(typeof input === "string" ? { as: input } : input),
    onSuccess: async (me: Me) => {
      await queryClient.cancelQueries({ queryKey: authKeys.me() });
      queryClient.setQueryData(authKeys.me(), me);
      // 지금 화면이 보고 있는 것은 새 계정으로 다시 받고, 나머지는 비웁니다(다시 받기를 기다리지 않음).
      for (const queryKey of ACCOUNT_QUERY_KEYS) void queryClient.resetQueries({ queryKey });
    },
  };
}

export function useDemoLogin() {
  const queryClient = useQueryClient();
  return useMutation(demoLoginMutationOptions(queryClient));
}

/**
 * 로그아웃. 이 휴대폰의 알림 구독 주소를 로그아웃 요청에 함께 보내 서버가 같은 요청에서 지우게 하고(로그인한
 * 본인만 지울 수 있음), 요청이 끝나면 성공·실패와 상관없이 브라우저 구독을 끊어 이 휴대폰에는 알림이 오지 않게
 * 합니다(서버에 남은 구독은 발송 때 푸시 서비스가 404·410을 돌려주면 지워짐, D-14).
 * 서버가 로그아웃을 확인한 뒤에만 로그인 정보와 계정별 캐시(ACCOUNT_QUERY_KEYS)를 비웁니다. 실패하면 세션 쿠키가
 * 살아 있으므로 로그인된 화면을 그대로 두고 오류를 돌려줍니다(공용 기기에서 로그아웃된 척하지 않음).
 * 이 기기에 남은 쓰던 내용은 성공·실패와 상관없이 `logout()`이 지웁니다.
 */
export function logoutMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async () => {
      const pushEndpoint = await subscriptionEndpoint();
      try {
        await logout(queryClient.getQueryData<Me | null>(authKeys.me())?.user.id, pushEndpoint);
      } finally {
        await forgetSubscription().catch(() => undefined);
      }
    },
    onSuccess: async () => {
      // 진행 중인 /api/me 응답이 로그아웃 뒤에 도착해 로그인 상태를 되살리지 않게 먼저 멈춥니다.
      await queryClient.cancelQueries({ queryKey: authKeys.me() });
      queryClient.setQueryData(authKeys.me(), null);
      for (const queryKey of ACCOUNT_QUERY_KEYS) queryClient.removeQueries({ queryKey });
    },
  };
}

/** 로그인한 채로 지금 판 약관에 동의합니다(판이 바뀌어 다시 물을 때). 응답은 동의를 반영한 내 정보입니다. */
export function useAgreeToTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => agreeToTerms(TERMS_VERSION),
    onSuccess: (me: Me) => {
      queryClient.setQueryData(authKeys.me(), me);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation(logoutMutationOptions(queryClient));
}
