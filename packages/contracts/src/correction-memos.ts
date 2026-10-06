import { z } from "zod";
import { GuideCategory } from "./guides.ts";
import { CONTROL_CHARACTER_MESSAGE, MULTILINE_TEXT, SINGLE_LINE_TEXT } from "./text.ts";

/** 수정 메모 상태. 화면 문구: 확인 전·반영됨·기존 유지. DB CHECK와 같은 목록입니다(screens.md §3). */
export const CORRECTION_MEMO_STATUSES = ["pending", "applied", "kept"] as const;
export const CorrectionMemoStatus = z.enum(CORRECTION_MEMO_STATUSES);
export type CorrectionMemoStatus = z.infer<typeof CorrectionMemoStatus>;

export const CORRECTION_MEMO_BODY_MAX = 200;
export const CORRECTION_MEMO_REASON_MAX = 200;
/** 한 사람이 같은 안내에 메모를 다시 남길 수 있기까지의 간격(429 `RATE_LIMITED`). 두 번 누름·반복 전송 방지. */
export const CORRECTION_MEMO_REPEAT_SECONDS = 60;

/**
 * 안내에 붙은 수정 메모. 작성자는 거주자에게도 집주인에게도 내보내지 않습니다(screens.md §4).
 * `keptReason`은 기존 유지(`kept`)일 때만 있고, `resolvedAt`은 반영·유지한 시각입니다.
 */
export const CorrectionMemo = z.object({
  id: z.uuid(),
  guideId: z.uuid(),
  body: z.string(),
  status: CorrectionMemoStatus,
  keptReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});
export type CorrectionMemo = z.infer<typeof CorrectionMemo>;

/** 안내 아래의 메모(거주자·집주인). `mine`: 요청한 사람이 쓴 메모(내 메모 상태 표시용). */
export const GuideCorrectionMemo = CorrectionMemo.extend({ mine: z.boolean() });
export type GuideCorrectionMemo = z.infer<typeof GuideCorrectionMemo>;

/** 최근에 쓴 순서로 최대 100개입니다. */
export const GuideCorrectionMemoList = z.object({ memos: z.array(GuideCorrectionMemo) });
export type GuideCorrectionMemoList = z.infer<typeof GuideCorrectionMemoList>;

/** 집주인의 메모 목록·검토(LF-13·17). 어느 안내의 메모인지(공개된 제목·종류) 함께 담습니다. */
export const ManagedCorrectionMemo = CorrectionMemo.extend({
  guideTitle: z.string(),
  guideCategory: GuideCategory,
});
export type ManagedCorrectionMemo = z.infer<typeof ManagedCorrectionMemo>;

/** 확인 전(`pending`) 메모가 먼저, 그다음 최근에 쓴 순서로 최대 200개입니다. */
export const ManagedCorrectionMemoList = z.object({ memos: z.array(ManagedCorrectionMemo) });
export type ManagedCorrectionMemoList = z.infer<typeof ManagedCorrectionMemoList>;

export const CorrectionMemoParams = z.object({ memoId: z.uuid() });
export type CorrectionMemoParams = z.infer<typeof CorrectionMemoParams>;

/** 집주인 목록 거르기. 관리 홈의 ‘확인할 것’은 `?status=pending`. */
export const CorrectionMemoListQuery = z.object({ status: CorrectionMemoStatus.optional() });
export type CorrectionMemoListQuery = z.infer<typeof CorrectionMemoListQuery>;

/** 내용이 달라요(LF-02, 12). */
export const CreateCorrectionMemoBody = z.object({
  body: z
    .string()
    .trim()
    .min(1)
    .max(CORRECTION_MEMO_BODY_MAX)
    .regex(MULTILINE_TEXT, CONTROL_CHARACTER_MESSAGE),
});
export type CreateCorrectionMemoBody = z.infer<typeof CreateCorrectionMemoBody>;

/** 기존 안내 유지(LF-17). 사유는 필수이고 줄바꿈·제어문자 없는 한 줄 200자 이하입니다. */
export const KeepCorrectionMemoBody = z.object({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(CORRECTION_MEMO_REASON_MAX)
    .regex(SINGLE_LINE_TEXT, "reason must be a single line without control characters"),
});
export type KeepCorrectionMemoBody = z.infer<typeof KeepCorrectionMemoBody>;
