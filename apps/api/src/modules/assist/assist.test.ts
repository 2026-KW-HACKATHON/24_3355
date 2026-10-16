import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { DEMO_BUILDING_ID, seedDemo } from "../../db/demo.ts";
import { guides, rateLimits } from "../../db/schema.ts";
import { createGoogleAi } from "../../lib/google.ts";
import {
  createManagedBuilding,
  createUser,
  jsonRequest,
  sessionCookie,
  testEnv,
  useTestApp,
} from "../../test/helpers.ts";
import { GUIDE_SPLIT_LIMIT } from "./service.ts";

const FLAGS = { GEMINI_ENABLED: "true", GCP_PROJECT: "wolgyeham-kw2026" };

type GeminiRequest = {
  contents: Array<{ parts: Array<{ text: string }> }>;
  generationConfig: {
    responseSchema: {
      properties: { drafts: { items: { properties: { category: { enum: string[] } } } } };
    };
  };
};

/** 다음 Vertex AI 응답을 정하는 가짜 fetch. 보낸 본문은 `sent`에 남습니다. */
const google = {
  next: (): Response => geminiAnswer({ drafts: [] }),
  sent: [] as Array<{ url: string; body: GeminiRequest }>,
};
const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
  google.sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
  return google.next();
});
const ai = createGoogleAi(testEnv(FLAGS), {
  fetch: fetchMock,
  getAuthHeaders: async () => ({ Authorization: "Bearer test-token" }),
});

function geminiAnswer(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return new Response(
    JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const t = useTestApp(FLAGS, { ai });

const KAKAO = [
  "안녕하세요 집주인입니다~",
  "1. 분리수거는 주차장 안쪽 수거함에 화요일 밤에 내놓아 주세요",
  "2. 보일러 고장나면 010-1234-5678 관리인에게 연락주세요",
  "월세 계좌 국민 123456-01-234567",
].join("\n");

function split(buildingId: string, body: unknown, cookie?: string) {
  return t.app.request(
    `/api/buildings/${buildingId}/guides/split`,
    jsonRequest("POST", body, cookie),
  );
}

describe("guide split", () => {
  it("masks contacts before sending and restores them in the drafts", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    google.sent = [];
    google.next = () => {
      const prompt = google.sent.at(-1)?.body.contents[0]?.parts[0]?.text ?? "";
      // 모델은 가린 글만 봅니다
      expect(prompt).not.toContain("010-1234-5678");
      expect(prompt).not.toContain("123456-01-234567");
      expect(prompt).toContain("[[P1]]");
      return geminiAnswer({
        drafts: [
          {
            category: "recycling",
            title: "분리수거는 주차장 안쪽",
            body: "분리수거는 주차장 안쪽 수거함에 화요일 밤에 내놓아 주세요",
          },
          {
            category: "facility",
            title: "보일러 고장",
            body: "보일러 고장나면 [[P1]] 관리인에게 연락주세요",
          },
          { category: "contact", title: "  ", body: "빈 제목은 뺍니다" },
        ],
      });
    };
    // When
    const response = await split(building.id, { text: KAKAO }, managerCookie);
    // Then
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.drafts).toEqual([
      {
        category: "recycling",
        title: "분리수거는 주차장 안쪽",
        body: "분리수거는 주차장 안쪽 수거함에 화요일 밤에 내놓아 주세요",
      },
      {
        category: "facility",
        title: "보일러 고장",
        body: "보일러 고장나면 010-1234-5678 관리인에게 연락주세요",
      },
    ]);
    // 계좌번호는 결과 어디에도 다시 넣지 못했습니다
    expect(result).toMatchObject({ maskedCount: 2, unplacedCount: 1 });
    expect(
      google.sent[0]?.body.generationConfig.responseSchema.properties.drafts.items.properties
        .category.enum,
    ).toEqual(["recycling", "parcel", "facility", "common", "contact"]);
    // 저장하지 않습니다
    const saved = await t.db.select().from(guides).where(eq(guides.buildingId, building.id));
    expect(saved).toEqual([]);
  });

  it("answers 502 UPSTREAM_FAILED for malformed or off-schema model output", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    for (const answer of [
      '{"drafts": [',
      { drafts: [{ category: "parking", title: "주차", body: "주차는 안쪽" }] },
      { notDrafts: [] },
    ]) {
      google.next = () => geminiAnswer(answer);
      // When
      const response = await split(building.id, { text: "주차는 안쪽에 해 주세요" }, managerCookie);
      // Then
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: { code: "UPSTREAM_FAILED" } });
    }
  });

  it("returns an empty list when the model finds nothing to split", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    google.next = () => geminiAnswer({ drafts: [] });
    // When
    const response = await split(building.id, { text: "안녕하세요" }, managerCookie);
    // Then
    expect(await response.json()).toEqual({ drafts: [], maskedCount: 0, unplacedCount: 0 });
  });

  it("is for the building's landlord only and validates the text", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const other = await sessionCookie(t.db, await createUser(t.db));
    fetchMock.mockClear();
    // When
    const guest = await split(building.id, { text: "본문" });
    const stranger = await split(building.id, { text: "본문" }, other);
    const empty = await split(building.id, { text: "   " }, managerCookie);
    const long = await split(building.id, { text: "가".repeat(4001) }, managerCookie);
    const unknown = await split(crypto.randomUUID(), { text: "본문" }, managerCookie);
    // Then
    expect(guest.status).toBe(401);
    expect(stranger.status).toBe(403);
    expect(await stranger.json()).toEqual({ error: { code: "NOT_BUILDING_MANAGER" } });
    expect(empty.status).toBe(400);
    expect(long.status).toBe(400);
    expect(unknown.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the read-only demo landlord from using it", async () => {
    // Given
    await seedDemo(t.db);
    fetchMock.mockClear();
    // When
    const response = await split(DEMO_BUILDING_ID, { text: "본문" });
    // Then
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limits each landlord to 20 splits an hour", async () => {
    // Given
    const { building, managerId, managerCookie } = await createManagedBuilding(t.db);
    google.next = () => geminiAnswer({ drafts: [] });
    await t.db.insert(rateLimits).values({
      bucket: "guide_split",
      subjectKey: managerId,
      hitCount: GUIDE_SPLIT_LIMIT.limit,
    });
    fetchMock.mockClear();
    // When
    const response = await split(building.id, { text: "본문" }, managerCookie);
    // Then
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(fetchMock).not.toHaveBeenCalled();
    await t.db
      .delete(rateLimits)
      .where(and(eq(rateLimits.bucket, "guide_split"), eq(rateLimits.subjectKey, managerId)));
  });

  it("reports the helpers it has turned on", async () => {
    // When
    const response = await t.app.request("/api/assist/config");
    // Then
    expect(await response.json()).toEqual({ guideSplit: true, translation: false });
  });
});

describe("guide split when GEMINI_ENABLED is off", () => {
  const off = useTestApp();

  it("answers 404 before looking at the request and hides it in the config", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(off.db);
    // When
    const response = await off.app.request(
      `/api/buildings/${building.id}/guides/split`,
      jsonRequest("POST", { text: "" }, managerCookie),
    );
    const config = await off.app.request("/api/assist/config");
    // Then
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND" } });
    expect(await config.json()).toEqual({ guideSplit: false, translation: false });
  });
});
