import { z } from "zod";
import { GUIDE_BODY_MAX, GUIDE_TITLE_MAX, GuideCategory } from "./guides.ts";
import { CONTROL_CHARACTER_MESSAGE, MULTILINE_TEXT } from "./text.ts";

/**
 * 집주인 도우미(D-37). 카톡 통째로 붙여넣기(Vertex AI Gemini)와 공개 안내·공지 기계 번역(Cloud Translation).
 * 둘 다 서버 환경 변수로 켜고(`GEMINI_ENABLED`, `TRANSLATION_ENABLED`), 꺼져 있으면 API는 404이고 웹은 숨깁니다.
 */

/** 붙여넣는 글 하나의 글자 수 상한. */
export const GUIDE_SPLIT_TEXT_MAX = 4000;
/** 한 번에 받는 초안 수 상한. 넘으면 앞에서부터 이만큼만 돌려줍니다. */
export const GUIDE_SPLIT_DRAFTS_MAX = 10;
/** 모델에 요청하는 초안 본문 길이. 받을 때는 안내 본문 상한(`GUIDE_BODY_MAX`)까지 받습니다. */
export const GUIDE_SPLIT_BODY_TARGET = 1000;

/** `POST /buildings/:buildingId/guides/split`(집주인). */
export const GuideSplitBody = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(GUIDE_SPLIT_TEXT_MAX)
    .regex(MULTILINE_TEXT, CONTROL_CHARACTER_MESSAGE),
});
export type GuideSplitBody = z.infer<typeof GuideSplitBody>;

/** 나눈 초안 하나. 아직 저장하지 않은 값이고, 집주인이 고친 뒤 기존 초안 만들기로 저장합니다. */
export const GuideSplitDraft = z.object({
  category: GuideCategory,
  title: z.string().min(1).max(GUIDE_TITLE_MAX),
  body: z.string().min(1).max(GUIDE_BODY_MAX),
});
export type GuideSplitDraft = z.infer<typeof GuideSplitDraft>;

/**
 * `maskedCount`: 보내기 전에 가린 전화번호·이메일·계좌 같은 숫자 수. `unplacedCount`: 그중 결과에 다시 넣지
 * 못한 수(모델이 자리 표시를 빠뜨림). 0보다 크면 웹이 원문과 비교해 달라고 알립니다.
 */
export const GuideSplitResult = z.object({
  drafts: z.array(GuideSplitDraft).max(GUIDE_SPLIT_DRAFTS_MAX),
  maskedCount: z.number().int().min(0),
  unplacedCount: z.number().int().min(0),
});
export type GuideSplitResult = z.infer<typeof GuideSplitResult>;

/** 번역할 수 있는 언어. 원문은 한국어입니다. 값은 Cloud Translation 언어 코드입니다. */
export const TRANSLATION_LANGS = ["en", "zh-CN", "vi"] as const;
export const TranslationLang = z.enum(TRANSLATION_LANGS);
export type TranslationLang = z.infer<typeof TranslationLang>;

export const TranslationQuery = z.object({ lang: TranslationLang });
export type TranslationQuery = z.infer<typeof TranslationQuery>;

/** `GET /guides/:guideId/translation`·`GET /notices/:noticeId/translation`. 기계 번역한 제목·본문입니다. */
export const ContentTranslation = z.object({
  lang: TranslationLang,
  title: z.string(),
  body: z.string(),
});
export type ContentTranslation = z.infer<typeof ContentTranslation>;

/** `GET /assist/config`. 서버에서 켠 도우미 기능. 웹은 꺼진 기능의 입구를 숨깁니다. */
export const AssistConfig = z.object({
  guideSplit: z.boolean(),
  translation: z.boolean(),
});
export type AssistConfig = z.infer<typeof AssistConfig>;
