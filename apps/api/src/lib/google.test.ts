import { describe, expect, it, vi } from "vitest";
import { testEnv } from "../test/helpers.ts";
import { AppError } from "./errors.ts";
import { createGoogleAi } from "./google.ts";

const env = testEnv({
  GEMINI_ENABLED: "true",
  TRANSLATION_ENABLED: "true",
  GCP_PROJECT: "wolgyeham-kw2026",
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function geminiResponse(text: string, finishReason = "STOP") {
  return jsonResponse({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });
}

const request = { system: "s", prompt: "p", schema: { type: "OBJECT" }, maxOutputTokens: 10 };

describe("createGoogleAi", () => {
  it("builds nothing when both helpers are off", () => {
    // When
    const ai = createGoogleAi(testEnv());
    // Then
    expect(ai).toEqual({ generateJson: null, translate: null });
  });

  it("calls Vertex AI generateContent with a JSON schema and parses the answer", async () => {
    // Given
    const fetch = vi.fn<typeof globalThis.fetch>(async () => geminiResponse('{"drafts":[]}'));
    const ai = createGoogleAi(env, {
      fetch,
      getAuthHeaders: async () => ({ Authorization: "Bearer token-1" }),
    });
    // When
    const result = await ai.generateJson?.(request);
    // Then
    expect(result).toEqual({ drafts: [] });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://us-west1-aiplatform.googleapis.com/v1/projects/wolgyeham-kw2026/locations/us-west1/publishers/google/models/gemini-2.5-flash:generateContent",
    );
    expect(init?.headers).toMatchObject({ Authorization: "Bearer token-1" });
    const body = JSON.parse(String(init?.body));
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT" },
      temperature: 0,
    });
    expect(body.contents[0].parts[0].text).toBe("p");
    expect(body.systemInstruction.parts[0].text).toBe("s");
  });

  it("turns malformed JSON, cut-off answers, HTTP errors and network failures into 502", async () => {
    // Given
    const answers: Array<() => Response> = [
      () => geminiResponse("{not json"),
      () => geminiResponse('{"drafts":[', "MAX_TOKENS"),
      () => jsonResponse({ candidates: [] }),
      () => jsonResponse({ error: { code: 429 } }, 429),
      () => new Response("<html>", { status: 200 }),
    ];
    for (const answer of answers) {
      const ai = createGoogleAi(env, {
        fetch: async () => answer(),
        getAuthHeaders: async () => ({ Authorization: "Bearer t" }),
      });
      // When / Then
      await expect(ai.generateJson?.(request)).rejects.toMatchObject({
        status: 502,
        code: "UPSTREAM_FAILED",
      });
    }
    const offline = createGoogleAi(env, {
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
      getAuthHeaders: async () => ({ Authorization: "Bearer t" }),
    });
    await expect(offline.translate?.(["a"], "en")).rejects.toBeInstanceOf(AppError);
    const noToken = createGoogleAi(env, {
      getAuthHeaders: async () => {
        throw new Error("no credentials");
      },
    });
    await expect(noToken.translate?.(["a"], "en")).rejects.toMatchObject({ status: 502 });
  });

  it("passes a 20s timeout signal", async () => {
    // Given
    const fetch = vi.fn<typeof globalThis.fetch>(async () => geminiResponse("{}"));
    const ai = createGoogleAi(env, {
      fetch,
      getAuthHeaders: async () => ({ Authorization: "Bearer t" }),
    });
    // When
    await ai.generateJson?.(request);
    // Then
    expect(fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("calls Translation v3 translateText as plain text from Korean", async () => {
    // Given
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ translations: [{ translatedText: "Title" }, { translatedText: "Body" }] }),
    );
    const ai = createGoogleAi(env, {
      fetch,
      getAuthHeaders: async () => ({ Authorization: "Bearer t" }),
    });
    // When
    const result = await ai.translate?.(["제목", "본문"], "en");
    // Then
    expect(result).toEqual(["Title", "Body"]);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://translation.googleapis.com/v3/projects/wolgyeham-kw2026/locations/global:translateText",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      contents: ["제목", "본문"],
      mimeType: "text/plain",
      sourceLanguageCode: "ko",
      targetLanguageCode: "en",
    });
  });

  it("rejects a translation answer with the wrong number of items", async () => {
    // Given
    const ai = createGoogleAi(env, {
      fetch: async () => jsonResponse({ translations: [{ translatedText: "only one" }] }),
      getAuthHeaders: async () => ({ Authorization: "Bearer t" }),
    });
    // Then
    await expect(ai.translate?.(["a", "b"], "vi")).rejects.toMatchObject({ status: 502 });
  });
});
