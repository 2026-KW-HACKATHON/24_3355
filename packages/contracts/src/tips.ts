import { z } from "zod";
import { CONTROL_CHARACTER_MESSAGE, MULTILINE_TEXT, SINGLE_LINE_TEXT } from "./text.ts";

/** 생활 팁 종류(19). 화면 문구: 분리수거·택배·겨울·공용공간·기타. DB CHECK와 같은 목록입니다. */
export const TIP_CATEGORIES = ["recycling", "parcel", "winter", "common", "other"] as const;
export const TipCategory = z.enum(TIP_CATEGORIES);
export type TipCategory = z.infer<typeof TipCategory>;

export const TIP_BODY_MAX = 200;
/** 콘텐츠 신고 사유(선택). */
export const CONTENT_REPORT_REASON_MAX = 200;

/**
 * 거주자가 남긴 팁(LF-06). 작성자는 누구에게도 내보내지 않고, 요청한 사람이 쓴 팁에만 `mine: true`입니다
 * (‘내 팁’과 고치기·지우기). 날짜는 작성 월(`YYYY-MM`, Asia/Seoul)만 줍니다(screens.md §4).
 */
export const Tip = z.object({
  id: z.uuid(),
  buildingId: z.uuid(),
  category: TipCategory,
  body: z.string(),
  createdMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  mine: z.boolean(),
});
export type Tip = z.infer<typeof Tip>;

/** 최근에 쓴 순서로 최대 200개입니다. 운영팀이 가린 팁은 빠집니다. */
export const TipList = z.object({ tips: z.array(Tip) });
export type TipList = z.infer<typeof TipList>;

/**
 * 내가 남긴 팁(LF-09 내 정보). `hidden`: 운영팀이 가려 다른 사람에게 보이지 않음.
 * `editable`: 지금 그 건물과 연결(active·reconfirm_needed)돼 있어 고치기·지우기를 할 수 있음.
 * 이사한 뒤에는 운영팀 요청으로 지웁니다.
 */
export const MyTip = Tip.extend({
  buildingName: z.string(),
  hidden: z.boolean(),
  editable: z.boolean(),
});
export type MyTip = z.infer<typeof MyTip>;

/** 최근에 쓴 순서로 최대 100개입니다. */
export const MyTipList = z.object({ tips: z.array(MyTip) });
export type MyTipList = z.infer<typeof MyTipList>;

export const TipParams = z.object({ tipId: z.uuid() });
export type TipParams = z.infer<typeof TipParams>;

const TipBody = z
  .string()
  .trim()
  .min(1)
  .max(TIP_BODY_MAX)
  .regex(MULTILINE_TEXT, CONTROL_CHARACTER_MESSAGE);

/** 생활 팁 남기기(LF-07). 종류와 내용만 받습니다. */
export const CreateTipBody = z.object({ category: TipCategory, body: TipBody });
export type CreateTipBody = z.infer<typeof CreateTipBody>;

/** 본인 팁 고치기. 보낸 필드만 바뀝니다. */
export const UpdateTipBody = z
  .object({ category: TipCategory.optional(), body: TipBody.optional() })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one field is required",
  });
export type UpdateTipBody = z.infer<typeof UpdateTipBody>;

/** 팁 신고(거주자·집주인). 사유는 선택입니다. */
export const CreateContentReportBody = z.object({
  reason: z
    .string()
    .trim()
    .max(CONTENT_REPORT_REASON_MAX)
    .regex(SINGLE_LINE_TEXT, CONTROL_CHARACTER_MESSAGE)
    .optional(),
});
export type CreateContentReportBody = z.infer<typeof CreateContentReportBody>;

/** 같은 팁을 이미 신고했으면 새로 만들지 않고 `alreadyReported: true`(200)입니다. */
export const ContentReportResult = z.object({ alreadyReported: z.boolean() });
export type ContentReportResult = z.infer<typeof ContentReportResult>;
