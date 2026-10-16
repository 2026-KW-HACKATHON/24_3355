import { TRANSLATION_LANGS, type TranslationLang } from "@wolgyeham/contracts";
import { useSyncExternalStore } from "react";

// 공개 안내·공지의 보기 언어(D-37). null은 한국어 원문입니다. 고른 언어는 이 기기에만 두고(`wh.lang`), 다른
// 안내·공지를 열어도 이어집니다. 저장이 안 되는 브라우저에서는 이번 방문에만 적용합니다.

export type ContentLang = TranslationLang | null;

/** 선택지 이름은 그 언어로 씁니다(그 언어를 읽는 사람이 찾을 수 있게). */
export const LANG_OPTIONS: ReadonlyArray<{ value: ContentLang; label: string; htmlLang: string }> =
  [
    { value: null, label: "한국어", htmlLang: "ko" },
    { value: "en", label: "English", htmlLang: "en" },
    { value: "zh-CN", label: "中文(简体)", htmlLang: "zh-CN" },
    { value: "vi", label: "Tiếng Việt", htmlLang: "vi" },
  ];

/** 읽어주기(speechSynthesis) 언어. 보이는 언어로 읽고, 그 언어 음성이 없으면 브라우저 기본 음성이 읽습니다. */
const SPEECH_LANG: Readonly<Record<TranslationLang | "ko", string>> = {
  ko: "ko-KR",
  en: "en-US",
  "zh-CN": "zh-CN",
  vi: "vi-VN",
};

export function speechLang(lang: ContentLang): string {
  return SPEECH_LANG[lang ?? "ko"];
}

export function htmlLang(lang: ContentLang): string {
  return LANG_OPTIONS.find((option) => option.value === lang)?.htmlLang ?? "ko";
}

export function parseLang(value: string | null | undefined): ContentLang {
  return (TRANSLATION_LANGS as readonly string[]).includes(value ?? "")
    ? (value as TranslationLang)
    : null;
}

const KEY = "wh.lang";
const listeners = new Set<() => void>();
let current: ContentLang | undefined;

function read(): ContentLang {
  if (current !== undefined) return current;
  try {
    current = parseLang(localStorage.getItem(KEY));
  } catch {
    current = null; // 비공개 모드·저장소 차단
  }
  return current;
}

export function setContentLang(lang: ContentLang) {
  current = lang;
  try {
    if (lang) localStorage.setItem(KEY, lang);
    else localStorage.removeItem(KEY);
  } catch {
    // 저장하지 못해도 이번 방문에는 적용합니다.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 테스트용: 메모리에 둔 값을 잊습니다. */
export function resetContentLangForTest() {
  current = undefined;
}

export function useContentLang(): ContentLang {
  return useSyncExternalStore(subscribe, read, () => null);
}
