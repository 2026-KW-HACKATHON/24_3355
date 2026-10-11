// 실제 건물에서 시연 끝내기(D-35). dev는 시연 건물과 실제 건물이 한 DB에 있어, 29에서 고른 시연 계정 쿠키가 남은
// 채로 실제 건물의 현관 QR·초대를 열면 카카오 로그인을 건너뛰고 서버가 403(`fields.account = "demo"`)으로 막습니다.
// 그래서 시연 계정(`Me.user.demo`)으로 실제 건물(`demo: false`) 화면을 열면 먼저 로그아웃하고 처음 온 사람처럼 이어 갑니다.
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toAppError } from "../../lib/errors";
import { usePublicBuilding } from "../buildings/queries";
import { type DemoTarget, shouldEndDemo } from "./demoRole";
import { authKeys, resetForIdentity, useMe } from "./queries";
import { endDemoSession, fetchMe } from "./session";

/** 이번 실행에서 끝내려 한 횟수(계정마다). 끝내도 다시 시연 계정으로 보이면 되풀이하지 않게 두 번까지만 합니다. */
const attempts = new Map<string, number>();
const MAX_ATTEMPTS = 2;
/** 끝내려다 실패했거나 횟수를 다 쓴 계정. 다시 시도하지 않습니다(서버 403 문구가 남음). */
const blockedUserIds = new Set<string>();
let running: Promise<void> | undefined;
/**
 * 시연을 끝냈을 때 토스트를 띄우는 곳(앱 틀의 `DemoEndedToast`). 화면이 바뀌어도 토스트가 남도록 틀에 둡니다.
 * 틀의 토스트가 아직 붙지 않았으면 한 번 남겨 두었다가 붙을 때 띄웁니다.
 */
const endedListeners = new Set<() => void>();
let endedUnseen = false;

export function onDemoEnded(listener: () => void): () => void {
  endedListeners.add(listener);
  if (endedUnseen) {
    endedUnseen = false;
    listener();
  }
  return () => {
    endedListeners.delete(listener);
  };
}

function notifyEnded() {
  if (endedListeners.size === 0) endedUnseen = true;
  for (const listener of endedListeners) listener();
}

/**
 * 시연을 끝냅니다. 캐시의 내 정보는 오래됐을 수 있어(다른 탭에서 카카오로 로그인) 먼저 새로 받고, 정말 시연 계정일 때만
 * `POST /api/dev/end-demo`를 부릅니다. 서버도 시연 세션만 끝내고 실제 세션이면 409라, 그때는 내 정보만 다시 받습니다.
 * 끝내면 캐시 전체를 되돌리고(`resetForIdentity`) 토스트를 한 번 띄웁니다. 시연 계정은 알림을 켤 수 없어 알림 구독은
 * 건드리지 않습니다(같은 휴대폰의 실제 계정 구독을 지키려고). 여러 화면이 동시에 불러도 한 번만 돕니다.
 */
export function endDemo(queryClient: QueryClient): Promise<void> {
  if (running) return running;
  running = (async () => {
    let userId: string | undefined;
    try {
      const fresh = await queryClient.fetchQuery({
        queryKey: authKeys.me(),
        queryFn: fetchMe,
        staleTime: 0,
      });
      if (!fresh?.user.demo) return;
      userId = fresh.user.id;
      const count = (attempts.get(userId) ?? 0) + 1;
      attempts.set(userId, count);
      if (count >= MAX_ATTEMPTS) blockedUserIds.add(userId);
      try {
        await endDemoSession(userId);
      } catch (error) {
        if (toAppError(error).code === "CONFLICT") {
          await queryClient.invalidateQueries({ queryKey: authKeys.me() });
          return;
        }
        throw error;
      }
      await resetForIdentity(queryClient, null);
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
      notifyEnded();
    } catch {
      if (userId) blockedUserIds.add(userId);
    } finally {
      running = undefined;
    }
  })();
  return running;
}

/**
 * 시연 계정으로 실제 건물 화면을 열면 시연을 끝냅니다. `building`은 이미 받은 건물이거나, 건물 id(시연 계정일 때만
 * 공개 건물을 받아 봄)입니다. 끝내는 동안 true를 돌려주므로 화면은 그동안 로딩으로 둡니다.
 */
export function useEndDemoOn(building: DemoTarget | string | undefined): boolean {
  const queryClient = useQueryClient();
  const me = useMe();
  const signedInMe = me.isSuccess ? me.data : undefined;
  const byId = typeof building === "string" ? building : "";
  const fetched = usePublicBuilding(byId, Boolean(byId && signedInMe?.user.demo));
  const target = typeof building === "string" ? fetched.data : building;
  const [, setSettled] = useState(0);
  const end = shouldEndDemo({ me: signedInMe, building: target, failedUserIds: blockedUserIds });

  useEffect(() => {
    if (!end) return;
    let active = true;
    void endDemo(queryClient).then(() => {
      // 내 정보가 그대로면(실패·409·횟수 초과) 다시 그려지지 않으므로 직접 다시 그립니다.
      if (active) setSettled((count) => count + 1);
    });
    return () => {
      active = false;
    };
  }, [end, queryClient]);

  return end;
}
