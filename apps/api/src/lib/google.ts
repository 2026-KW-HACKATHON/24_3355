import type { Env } from "./env.ts";
import { AppError } from "./errors.ts";
import { log } from "./log.ts";

/** Vertex AI·Cloud Translation 한 번의 제한 시간. */
export const GOOGLE_TIMEOUT_MS = 20_000;
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export type GenerateJsonRequest = {
  /** 시스템 지시. */
  system: string;
  /** 사용자 글(가린 뒤). */
  prompt: string;
  /** Vertex AI `responseSchema`(OpenAPI 부분집합). */
  schema: Record<string, unknown>;
  maxOutputTokens: number;
};

/**
 * 집주인 도우미가 부르는 Google API(D-37). 꺼진 기능은 null입니다. 실패(연결·시간 초과·2xx 아님·형식이 다른
 * 응답)는 모두 502 `UPSTREAM_FAILED`이고, 로그에는 API 이름과 HTTP 상태만 남깁니다(글은 남기지 않음).
 */
export type GoogleAi = {
  /** Gemini `generateContent`(JSON 응답). 모델이 낸 JSON을 파싱만 해서 돌려주고, 검증은 부르는 쪽이 합니다. */
  generateJson: ((request: GenerateJsonRequest) => Promise<unknown>) | null;
  /** Translation v3 `translateText`(한국어 → `target`, text/plain). 넣은 순서대로 돌려줍니다. */
  translate: ((texts: readonly string[], target: string) => Promise<string[]>) | null;
};

export const DISABLED_GOOGLE_AI: GoogleAi = { generateJson: null, translate: null };

type Deps = {
  fetch?: typeof fetch;
  /**
   * 요청에 붙일 인증 헤더(`Authorization`, ADC에 할당량 프로젝트가 있으면 `x-goog-user-project`). 테스트·스모크용이고,
   * 비우면 Application Default Credentials(google-auth-library)를 처음 쓸 때 불러옵니다.
   */
  getAuthHeaders?: () => Promise<Record<string, string>>;
};

function upstreamFailed(api: string, status?: number): AppError {
  log("warn", "google_api_failed", { api, status });
  return new AppError(502, "UPSTREAM_FAILED");
}

/**
 * ADC 헤더. 로컬 사용자 자격 증명은 Translation API가 할당량 프로젝트를 요구하므로
 * (`gcloud auth application-default set-quota-project`) 라이브러리가 만드는 헤더를 그대로 씁니다.
 */
function adcHeaders(): () => Promise<Record<string, string>> {
  let auth: Promise<{ getRequestHeaders(): Promise<Record<string, string>> }> | undefined;
  return async () => {
    auth ??= import("google-auth-library").then(
      ({ GoogleAuth }) => new GoogleAuth({ scopes: SCOPE }),
    );
    return (await auth).getRequestHeaders();
  };
}

/** 켜진 기능만 만듭니다. 둘 다 꺼져 있으면 google-auth-library를 불러오지도 않습니다. */
export function createGoogleAi(env: Env, deps: Deps = {}): GoogleAi {
  const project = env.GCP_PROJECT;
  if (!project || (!env.GEMINI_ENABLED && !env.TRANSLATION_ENABLED)) return DISABLED_GOOGLE_AI;
  const doFetch = deps.fetch ?? fetch;
  const getAuthHeaders = deps.getAuthHeaders ?? adcHeaders();

  async function post(api: string, url: string, body: unknown): Promise<unknown> {
    let response: Response;
    try {
      const auth = await getAuthHeaders();
      response = await doFetch(url, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      });
    } catch {
      throw upstreamFailed(api);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw upstreamFailed(api, response.status);
    }
    try {
      return await response.json();
    } catch {
      throw upstreamFailed(api, response.status);
    }
  }

  const location = env.GEMINI_LOCATION;
  const generateUrl =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}` +
    `/publishers/google/models/${env.GEMINI_MODEL}:generateContent`;
  const translateUrl = `https://translation.googleapis.com/v3/projects/${project}/locations/global:translateText`;

  return {
    generateJson: env.GEMINI_ENABLED
      ? async (request) => {
          const data = await post("vertex_generate", generateUrl, {
            systemInstruction: { parts: [{ text: request.system }] },
            contents: [{ role: "user", parts: [{ text: request.prompt }] }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: request.maxOutputTokens,
              responseMimeType: "application/json",
              responseSchema: request.schema,
              // 나누기만 하므로 생각(thinking) 토큰을 쓰지 않습니다(비용·지연).
              thinkingConfig: { thinkingBudget: 0 },
            },
          });
          const text = candidateText(data);
          if (text === undefined) throw upstreamFailed("vertex_generate", 200);
          try {
            return JSON.parse(text) as unknown;
          } catch {
            throw upstreamFailed("vertex_generate", 200);
          }
        }
      : null,
    translate: env.TRANSLATION_ENABLED
      ? async (texts, target) => {
          const data = await post("translate_text", translateUrl, {
            contents: texts,
            mimeType: "text/plain",
            sourceLanguageCode: "ko",
            targetLanguageCode: target,
          });
          const translations = (data as { translations?: unknown } | null)?.translations;
          if (!Array.isArray(translations) || translations.length !== texts.length) {
            throw upstreamFailed("translate_text", 200);
          }
          return translations.map((item) => {
            const value = (item as { translatedText?: unknown } | null)?.translatedText;
            if (typeof value !== "string") throw upstreamFailed("translate_text", 200);
            return value;
          });
        }
      : null,
  };
}

/** 첫 후보의 글 조각을 이어 붙입니다. 끝까지 쓰지 못했으면(토큰 한도·안전 차단) undefined. */
function candidateText(data: unknown): string | undefined {
  const candidate = (data as { candidates?: unknown[] } | null)?.candidates?.[0] as
    | { finishReason?: unknown; content?: { parts?: unknown[] } }
    | undefined;
  if (!candidate || (candidate.finishReason !== undefined && candidate.finishReason !== "STOP")) {
    return undefined;
  }
  const parts = candidate.content?.parts;
  if (!Array.isArray(parts)) return undefined;
  const text = parts
    .map((part) => (part as { text?: unknown } | null)?.text)
    .filter((value): value is string => typeof value === "string")
    .join("");
  return text || undefined;
}
