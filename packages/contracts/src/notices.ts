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
