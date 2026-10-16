import type { ContentTranslation } from "@wolgyeham/contracts";
import { type ContentLang, setContentLang, useContentLang } from "./contentLang";
import { type TranslationKind, useAssistConfig, useContentTranslation } from "./queries";

export type TranslationStatus = "original" | "loading" | "error" | "translated";

type Text = { title: string; body: string };

/**
 * 화면에 보일 제목·본문과 상태. 원문을 고르거나 번역이 아직·실패면 원문을 보여줍니다(번역이 없다고 글을 비우지
 * 않음). 서버에서 번역을 끈 환경이면 고른 언어와 상관없이 원문입니다.
 */
export function displayContent(
  original: Text,
  lang: ContentLang,
  query: { data?: ContentTranslation | undefined; isError: boolean },
): Text & { lang: ContentLang; status: TranslationStatus } {
  if (lang === null) return { ...original, lang: null, status: "original" };
  if (query.data && query.data.lang === lang) {
    return { title: query.data.title, body: query.data.body, lang, status: "translated" };
  }
  return { ...original, lang: null, status: query.isError ? "error" : "loading" };
}

/** 공개 안내·공지 상세의 보기 언어(D-37). `version`은 원문이 바뀐 때입니다(안내 `updatedAt` 등). */
export function useTranslatedContent(
  kind: TranslationKind,
  id: string,
  version: string,
  original: Text,
) {
  const { translation: enabled } = useAssistConfig();
  const chosen = useContentLang();
  const lang = enabled ? chosen : null;
  const query = useContentTranslation(kind, id, version, lang);
  return {
    enabled,
    /** 고른 언어(번역 중·실패여도 고른 값). */
    chosen: lang,
    setLang: setContentLang,
    retry: () => void query.refetch(),
    retrying: query.isFetching,
    ...displayContent(original, lang, query),
  };
}

export type TranslatedContent = ReturnType<typeof useTranslatedContent>;
