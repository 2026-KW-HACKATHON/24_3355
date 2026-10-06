import { z } from "zod";

export const NOTICE_STATUSES = ["published", "expired"] as const;
export const NoticeStatus = z.enum(NOTICE_STATUSES);
export type NoticeStatus = z.infer<typeof NoticeStatus>;

/** `startsAt`~`endsAt`은 적용 기간입니다. `endsAt`이 지나면 공개 화면에서 내려갑니다. */
export const Notice = z.object({
  id: z.uuid(),
  buildingId: z.uuid(),
  title: z.string(),
  body: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  publishedAt: z.iso.datetime(),
});
export type Notice = z.infer<typeof Notice>;

/** 끝나지 않은 공지 중 가장 최근에 올린 하나. 없으면 null. */
export const CurrentNoticeResponse = z.object({ notice: Notice.nullable() });
export type CurrentNoticeResponse = z.infer<typeof CurrentNoticeResponse>;

export const NOTICE_TITLE_MAX = 80;
export const NOTICE_BODY_MAX = 1000;

export const NoticeParams = z.object({ noticeId: z.uuid() });
export type NoticeParams = z.infer<typeof NoticeParams>;

/** 끝나지 않은 공지(`endsAt`이 지나지 않음)만 최근에 올린 순서로 담습니다. */
export const NoticeList = z.object({ notices: z.array(Notice) });
export type NoticeList = z.infer<typeof NoticeList>;

/** 공지 올리기(LF-15). `endsAt`은 `startsAt` 이후이고 지금보다 뒤여야 합니다. */
export const CreateNoticeBody = z
  .object({
    title: z.string().trim().min(1).max(NOTICE_TITLE_MAX),
    body: z.string().trim().min(1).max(NOTICE_BODY_MAX),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .refine((value) => Date.parse(value.endsAt) >= Date.parse(value.startsAt), {
    message: "endsAt must not be before startsAt",
    path: ["endsAt"],
  });
export type CreateNoticeBody = z.infer<typeof CreateNoticeBody>;

/**
 * `attemptedCount`: 발송을 시도한 알림 대상 수. 도착·열람을 뜻하지 않습니다
 * (“알림 대상 N명에게 발송을 시도했어요”). 푸시가 설정되지 않은 환경에서는 0입니다.
 */
export const CreateNoticeResult = z.object({
  notice: Notice,
  attemptedCount: z.number().int().min(0),
});
export type CreateNoticeResult = z.infer<typeof CreateNoticeResult>;

/**
 * 공지 올리기 화면의 대상 수(집주인). `connectedCount`는 월계함에 연결된(active) 거주자,
 * `pushTargetCount`는 그중 알림을 켠 사람입니다. 실제 세입자 수와 다를 수 있습니다.
 */
export const NoticeAudience = z.object({
  connectedCount: z.number().int().min(0),
  pushTargetCount: z.number().int().min(0),
});
export type NoticeAudience = z.infer<typeof NoticeAudience>;

/** 브라우저 푸시 서비스 호스트. Chrome·Edge(Android)·Samsung Internet은 FCM, Firefox는 Mozilla, Safari는 Apple, Edge(Windows)는 WNS입니다. */
export const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
] as const;
export const PUSH_SERVICE_HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"] as const;

/** 소문자 DNS 이름(라벨 1~63자, 전체 253자 이하, 마지막 라벨은 글자로 시작). IP 주소와 특수문자를 받지 않습니다. */
const DNS_NAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** 공백·제어문자. 주소 어디에도 있으면 안 됩니다. */
const SPACE_OR_CONTROL = /[\s\p{Cc}]/u;

/**
 * 알려진 브라우저 푸시 서비스의 https 주소인지 봅니다. 서버가 이 주소로 요청을 보내므로(구독 저장과 발송 때 모두
 * 확인) 해석기마다 호스트를 다르게 읽을 여지를 없앱니다: https만, 계정 정보·포트 없음, 호스트는 엄격한 DNS
 * 이름(`;`·`'`·`{` 같은 문자나 퍼센트 인코딩이 섞이면 거부), 원문이 정확히 `https://<호스트>/`로 시작하고 공백·
 * 제어문자가 없어야 하며, 호스트는 허용 목록과 같거나 허용 접미사 앞에 라벨이 하나 이상 있어야 합니다.
 */
export function isAllowedPushEndpoint(value: string): boolean {
  if (value.length > 2048 || SPACE_OR_CONTROL.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname;
  if (!DNS_NAME.test(host) || !value.startsWith(`https://${host}/`)) return false;
  return (
    (PUSH_SERVICE_HOSTS as readonly string[]).includes(host) ||
    PUSH_SERVICE_HOST_SUFFIXES.some(
      (suffix) => host.endsWith(suffix) && host.length > suffix.length,
    )
  );
}

/** 브라우저 `PushSubscription.toJSON()` 모양. `endpoint`는 알려진 푸시 서비스 주소만 받습니다. */
export const PushSubscriptionBody = z.object({
  endpoint: z
    .url({ protocol: /^https$/ })
    .max(2048)
    .refine(isAllowedPushEndpoint, "endpoint must be a known browser push service"),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(64),
  }),
});
export type PushSubscriptionBody = z.infer<typeof PushSubscriptionBody>;

export const DeletePushSubscriptionBody = z.object({ endpoint: z.string().min(1).max(2048) });
export type DeletePushSubscriptionBody = z.infer<typeof DeletePushSubscriptionBody>;

/** 브라우저 구독에 쓰는 VAPID 공개키(base64url). 서버에 푸시가 설정되지 않았으면 null. */
export const PushPublicKey = z.object({ publicKey: z.string().nullable() });
export type PushPublicKey = z.infer<typeof PushPublicKey>;

/** 새 공지 알림으로 보내는 내용. service worker가 `url`(같은 출처 경로)을 엽니다. */
export const NoticePushPayload = z.object({
  type: z.literal("notice"),
  noticeId: z.uuid(),
  buildingId: z.uuid(),
  title: z.string(),
  url: z.string(),
});
export type NoticePushPayload = z.infer<typeof NoticePushPayload>;
