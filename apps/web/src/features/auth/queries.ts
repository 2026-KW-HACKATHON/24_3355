import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type DevLoginBody, type Me, TERMS_VERSION } from "@wolgyeham/contracts";
import { forgetSubscription, loadSavedPush, subscriptionEndpoint } from "../push/push";
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
 * 계정이 바뀔 때(시연 로그인, 로그아웃·시연 끝내기) 캐시 전체를 새 계정 기준으로 되돌립니다(D-35). 진행 중인 요청을
 * 멈추고, 보고 있지 않은 캐시는 지우고, 내 정보를 새 값으로 둔 뒤 지금 화면이 보고 있는 것은 처음 상태로 되돌려
 * 다시 받습니다. 이전 계정의 내 정보·관리 건물·건물 화면이 다음 계정 화면에 잠깐이라도 보이지 않게 합니다.
 * 카카오 로그인은 콜백에서 페이지를 새로 열어 캐시가 비어 있는 채로 시작합니다.
 */
export async function resetForIdentity(queryClient: QueryClient, me: Me | null) {
  // 이전 계정으로 보낸 쓰기(팁 저장 등)가 끝나며 캐시에 쓰는 것을 되돌리기 전에 기다립니다(그 뒤에 지움).
  await settleOtherMutations(queryClient);
  // 진행 중인 /api/me 응답이 늦게 도착해 이전 계정을 되살리지 않게 내 정보도 함께 멈춥니다.
  await queryClient.cancelQueries({ predicate: (query) => query.queryKey[0] !== "dev" });
  queryClient.setQueryData(authKeys.me(), me);
  queryClient.removeQueries({ type: "inactive", predicate: isAccountQuery });
  void queryClient.resetQueries({ type: "active", predicate: isAccountQuery });
}

/** 계정을 바꾸는 쓰기(시연 로그인·로그아웃)의 키. 그 자신은 기다리지 않습니다. */
const IDENTITY_MUTATION = "identity";
/** 이전 계정의 쓰기를 이만큼까지만 기다립니다(느린 연결에서 계정 전환이 멈추지 않게). */
const SETTLE_TIMEOUT_MS = 5000;

/** 계정 전환 말고 진행 중인 쓰기가 끝날 때까지(성공 처리로 캐시에 쓰는 것까지) 기다립니다. */
export function settleOtherMutations(
  queryClient: QueryClient,
  timeoutMs = SETTLE_TIMEOUT_MS,
): Promise<void> {
  const busy = () =>
    queryClient.isMutating({
      predicate: (mutation) => mutation.options.mutationKey?.[0] !== IDENTITY_MUTATION,
    }) > 0;
  if (!busy()) return Promise.resolve();
  return new Promise((resolve) => {
    const cache = queryClient.getMutationCache();
    const done = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    const unsubscribe = cache.subscribe(() => {
      if (!busy()) done();
    });
  });
}

/**
 * 계정이 바뀌면 되돌릴 캐시: 내 정보(새 값으로 바로 둠)와 시연 모드 확인·시연 목록(`["dev", …]`, 누가 보든 같음,
 * 29에서 역할을 고르는 동안 그 화면이 다시 로딩으로 바뀌지 않게)만 빼고 모두.
 */
function isAccountQuery(query: { queryKey: readonly unknown[] }): boolean {
  const [head] = query.queryKey;
  return head !== authKeys.me()[0] && head !== "dev";
}

/**
 * 시연용 로그인(계정 전환). 새 계정으로 다시 받도록 캐시 전체를 되돌립니다(`resetForIdentity`).
 * 동의를 받은 곳(16·29)은 `{ as, consent }`로 약관 판을 함께 보냅니다(D-28).
 */
export function demoLoginMutationOptions(queryClient: QueryClient) {
  return {
    mutationKey: [IDENTITY_MUTATION, "demo-login"],
    mutationFn: (input: DevLoginBody["as"] | DevLoginBody) =>
      demoLogin(typeof input === "string" ? { as: input } : input),
    onSuccess: (me: Me) => resetForIdentity(queryClient, me),
  };
}

export function useDemoLogin() {
  const queryClient = useQueryClient();
  return useMutation(demoLoginMutationOptions(queryClient));
}

/**
 * 로그아웃할 때 이 휴대폰의 알림 구독을 정리할지. 시연을 보려고 카카오 계정에서 나갈 때(`keepPush`)와, 이 휴대폰의
 * 구독이 다른 계정의 것으로 저장돼 있을 때(카카오 계정 → 시연 → 시연 끝내기)는 그 계정의 알림을 지키려고 건드리지
 * 않습니다(D-35).
 */
export function logoutTouchesPush(
  userId: string | undefined,
  saved: { userId: string } | undefined,
  keepPush = false,
): boolean {
  if (keepPush) return false;
  return saved === undefined || saved.userId === userId;
}

export type LogoutOptions = { keepPush?: boolean } | undefined;

/**
 * 로그아웃. 이 휴대폰의 알림 구독 주소를 로그아웃 요청에 함께 보내 서버가 같은 요청에서 지우게 하고(로그인한
 * 본인만 지울 수 있음), 요청이 끝나면 성공·실패와 상관없이 브라우저 구독을 끊어 이 휴대폰에는 알림이 오지 않게
 * 합니다(서버에 남은 구독은 발송 때 푸시 서비스가 404·410을 돌려주면 지워짐, D-14). 다른 계정의 구독이면 두 가지를
 * 모두 하지 않습니다(`logoutTouchesPush`).
 * 서버가 로그아웃을 확인한 뒤에만 로그인 정보를 비우고 캐시 전체를 되돌립니다(`resetForIdentity`). 실패하면 세션
 * 쿠키가 살아 있으므로 로그인된 화면을 그대로 두고 오류를 돌려줍니다(공용 기기에서 로그아웃된 척하지 않음).
 * 이 기기에 남은 쓰던 내용은 성공·실패와 상관없이 `logout()`이 지웁니다.
 */
export function logoutMutationOptions(queryClient: QueryClient) {
  return {
    mutationKey: [IDENTITY_MUTATION, "logout"],
    mutationFn: async (options?: LogoutOptions) => {
      const userId = queryClient.getQueryData<Me | null>(authKeys.me())?.user.id;
      const touchPush = logoutTouchesPush(userId, loadSavedPush(), options?.keepPush);
      const pushEndpoint = touchPush ? await subscriptionEndpoint() : undefined;
      try {
        await logout(userId, pushEndpoint);
      } finally {
        if (touchPush) await forgetSubscription().catch(() => undefined);
      }
    },
    // 진행 중인 /api/me 응답이 로그아웃 뒤에 도착해 로그인 상태를 되살리지 않게 먼저 멈춥니다(resetForIdentity).
    onSuccess: () => resetForIdentity(queryClient, null),
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
