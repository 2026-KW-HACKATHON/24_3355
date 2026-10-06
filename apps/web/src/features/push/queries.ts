import { useQuery } from "@tanstack/react-query";
import { PushPublicKey } from "@wolgyeham/contracts";
import { useCallback, useEffect, useState } from "react";
import { getJson } from "../../lib/api";
import { detectPushEnv, type PushEnv, readPushEnvInput } from "../../lib/pushEnv";
import { useMe } from "../auth/queries";
import { currentSubscription, isConfirmedSubscription } from "./push";

export const pushKeys = {
  publicKey: () => ["push", "public-key"] as const,
};

/** 서버 VAPID 공개키. null이면 보낼 수 없는 환경(‘지원 안 됨’으로 안내). */
export function usePushPublicKey(enabled = true) {
  return useQuery({
    queryKey: pushKeys.publicKey(),
    queryFn: () => getJson("/api/push-subscriptions/public-key", PushPublicKey),
    select: (data) => data.publicKey,
    staleTime: Number.POSITIVE_INFINITY,
    enabled,
  });
}

/**
 * 이 브라우저의 알림 환경(screens.md §6). `active`일 때만 구독 여부를 확인합니다.
 * ‘켜짐’은 브라우저 구독이 있고, 그 구독을 지금 계정으로 서버에 저장한 것을 확인했을 때만입니다.
 * 공개키를 받는 동안은 `env`가 없습니다(시트는 ‘확인하는 중’). `refresh()`는 권한·구독을 바꾼 뒤
 * 다시 판정할 때 씁니다.
 */
export function usePushEnv(active: boolean) {
  const key = usePushPublicKey(active);
  const userId = useMe().data?.user.id;
  // undefined: 아직 확인 전, null: 이 브라우저에 구독 없음
  const [endpoint, setEndpoint] = useState<string | null>();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // 권한·구독을 바꾼 뒤 다시 확인하려고 version을 읽습니다.
    void version;
    void currentSubscription().then((subscription) => {
      if (!cancelled) setEndpoint(subscription?.endpoint ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [active, version]);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const confirmed = isConfirmedSubscription(endpoint ?? undefined, userId);
  const env: PushEnv | undefined =
    active && endpoint !== undefined && !key.isPending
      ? detectPushEnv(readPushEnvInput({ serverKey: key.data, subscribed: confirmed }))
      : undefined;

  return {
    env,
    publicKey: key.data,
    keyError: key.isError,
    retryKey: () => void key.refetch(),
    /** 브라우저 구독은 있는데 지금 계정으로 저장됐는지 확인하지 못함(다시 저장할 대상). */
    unconfirmed: typeof endpoint === "string" && !confirmed,
    userId,
    refresh,
  };
}
