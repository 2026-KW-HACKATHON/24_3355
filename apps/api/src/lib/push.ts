import https from "node:https";
import { isAllowedPushEndpoint } from "@wolgyeham/contracts";
import webPush from "web-push";
import type { Env } from "./env.ts";
import { log } from "./log.ts";

/** 푸시를 보낼 브라우저 구독(`push_subscriptions` 한 행). */
export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/**
 * `sent`: 푸시 서비스가 받음(도착·열람은 아님). `gone`: 404·410이라 구독을 지워야 함.
 * `failed`: 그 밖의 실패(네트워크, 5xx, 시간 초과, 허용하지 않은 주소 등).
 */
export type PushResult = "sent" | "gone" | "failed";

/**
 * 웹 푸시 발송 창구. createApp이 요청마다 `c.var.push`로 넣고, 테스트는 가짜를 넘깁니다.
 * `isConfigured()`가 false면 서비스는 발송을 시도하지 않고 `attempted_at`도 남기지 않습니다.
 */
export type PushSender = {
  isConfigured(): Promise<boolean>;
  send(target: PushTarget, payload: string): Promise<PushResult>;
};

/** 알림을 보내지 않는 발송기. */
export const disabledPushSender: PushSender = {
  isConfigured: async () => false,
  send: async () => "failed",
};

const PUSH_TTL_SECONDS = 24 * 60 * 60;
/** 요청 하나의 전체 제한 시간. 느리게 흘려보내는 응답도 이 시각에 연결을 끊습니다. */
const PUSH_DEADLINE_MS = 10_000;
/** 응답 본문은 읽어 버리기만 하고, 이보다 길면 연결을 끊습니다(메모리에 모으지 않음). */
const RESPONSE_BYTES_MAX = 64 * 1024;

type PushRequest = {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: Buffer | null;
};

/**
 * 푸시 서비스로 HTTPS 요청을 보내고 상태 코드를 돌려줍니다. 주소는 허용 목록 검사와 같은 WHATWG URL에서
 * 꺼내므로 검사한 호스트와 연결하는 호스트가 다를 수 없습니다(`web-push`의 `url.parse` 경로를 쓰지 않음).
 * 요청마다 새 Agent를 쓰고 `deadlineMs`가 지나면 요청과 Agent를 모두 끊습니다.
 */
function sendHttps(request: PushRequest, deadlineMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ keepAlive: false, maxSockets: 1 });
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      agent.destroy();
    };
    const req = https.request({
      protocol: "https:",
      hostname: request.url.hostname,
      servername: request.url.hostname,
      port: 443,
      path: `${request.url.pathname}${request.url.search}`,
      method: request.method,
      headers: request.headers,
      agent,
    });
    timer = setTimeout(() => {
      req.destroy(new Error("push deadline exceeded"));
      agent.destroy();
      if (!settled) {
        settled = true;
        reject(new Error("push deadline exceeded"));
      }
    }, deadlineMs);
    req.on("response", (response) => {
      if (!settled) {
        settled = true;
        resolve(response.statusCode ?? 0);
      }
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > RESPONSE_BYTES_MAX) req.destroy();
      });
      response.on("end", cleanup);
      response.on("close", cleanup);
      response.on("error", cleanup);
    });
    req.on("error", (error) => {
      cleanup();
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    req.end(request.body ?? undefined);
  });
}

/**
 * VAPID 키 세 개가 있으면 보내는 기본 발송기. 키가 없으면 보내지 않습니다. 키 형식이 틀리면 시작할 때 키 이름만
 * 적은 오류로 멈춥니다(값은 출력하지 않음). 암호화·VAPID 헤더는 `web-push`의 `generateRequestDetails`로 만들고,
 * 요청은 `sendHttps`가 보냅니다. 보낼 때마다 주소가 알려진 푸시 서비스인지 다시 확인하고, 아니면 보내지 않고
 * `failed`입니다.
 */
export function createWebPushSender(env: Env, options: { deadlineMs?: number } = {}): PushSender {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return disabledPushSender;
  try {
    // 키 길이·형식과 subject를 검사합니다(발송하지 않음).
    webPush.getVapidHeaders(
      "https://fcm.googleapis.com",
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY,
      "aes128gcm",
    );
  } catch {
    throw new Error("Invalid environment variables: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY");
  }
  const vapidDetails = {
    subject: VAPID_SUBJECT,
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
  };
  const deadlineMs = options.deadlineMs ?? PUSH_DEADLINE_MS;

  return {
    isConfigured: async () => true,
    async send(target, payload) {
      if (!isAllowedPushEndpoint(target.endpoint)) {
        log("warn", "push_endpoint_rejected");
        return "failed";
      }
      let status: number;
      try {
        const details = webPush.generateRequestDetails(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          payload,
          { TTL: PUSH_TTL_SECONDS, vapidDetails },
        );
        status = await sendHttps(
          {
            url: new URL(target.endpoint),
            method: details.method,
            headers: details.headers,
            body: details.body,
          },
          deadlineMs,
        );
      } catch {
        return "failed";
      }
      if (status >= 200 && status <= 299) return "sent";
      return status === 404 || status === 410 ? "gone" : "failed";
    },
  };
}
