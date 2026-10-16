import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AssistConfig,
  ContentTranslation,
  GuideSplitResult,
  type TranslationLang,
} from "@wolgyeham/contracts";
import { getJson, http, seg } from "../../lib/api";
import { toAppError } from "../../lib/errors";

export const assistKeys = {
  config: () => ["assist", "config"] as const,
  /** `version`은 원문이 바뀐 때(안내 `updatedAt` 등). 바뀌면 새로 받습니다. */
  translation: (kind: TranslationKind, id: string, version: string, lang: TranslationLang) =>
    ["translation", kind, id, version, lang] as const,
};

const OFF: AssistConfig = { guideSplit: false, translation: false };

/**
 * 서버에서 켠 도우미 기능(D-37). 불러오지 못했거나 아직이면 모두 꺼진 것으로 보고 입구를 숨깁니다(AWS 등 끈 환경은
 * 항상 false).
 */
export function useAssistConfig(): AssistConfig {
  const query = useQuery({
    queryKey: assistKeys.config(),
    queryFn: () => getJson("/api/assist/config", AssistConfig),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  return query.data ?? OFF;
}

/** 카톡 통째로 나누기. 모델 응답을 기다리므로 제한 시간을 서버(20초)보다 조금 길게 둡니다. 저장하지 않습니다. */
export function useSplitGuides(buildingId: string) {
  return useMutation({
    mutationFn: async (text: string) => {
      try {
        return await http
          .post(`/api/buildings/${seg(buildingId)}/guides/split`, {
            json: { text },
            timeout: 30_000,
          })
          .json(GuideSplitResult);
      } catch (error) {
        throw toAppError(error);
      }
    },
  });
}

export type TranslationKind = "guide" | "notice";

/** 공개 안내·공지의 기계 번역. `lang`이 null(한국어 원문)이면 부르지 않습니다. */
export function useContentTranslation(
  kind: TranslationKind,
  id: string,
  version: string,
  lang: TranslationLang | null,
) {
  return useQuery({
    queryKey: assistKeys.translation(kind, id, version, lang ?? "en"),
    queryFn: () =>
      getJson(
        `/api/${kind === "guide" ? "guides" : "notices"}/${seg(id)}/translation?lang=${seg(lang ?? "en")}`,
        ContentTranslation,
      ),
    enabled: lang !== null,
    staleTime: 5 * 60 * 1000,
  });
}
