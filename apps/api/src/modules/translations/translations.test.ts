import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { contentTranslations, guides, notices, rateLimits } from "../../db/schema.ts";
import { createGoogleAi } from "../../lib/google.ts";
import {
  createBuilding,
  createGuide,
  createManagedBuilding,
  testEnv,
  useTestApp,
  withCookie,
} from "../../test/helpers.ts";
import { TRANSLATION_DAILY_LIMIT, TRANSLATION_IP_LIMIT } from "./service.ts";

const FLAGS = { TRANSLATION_ENABLED: "true", GCP_PROJECT: "wolgyeham-kw2026" };
const DAY_MS = 24 * 60 * 60 * 1000;

/** 받은 글 앞에 언어 코드를 붙여 돌려주는 가짜 Translation API. */
const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
  const body = JSON.parse(String(init?.body)) as { contents: string[]; targetLanguageCode: string };
  return new Response(
    JSON.stringify({
      translations: body.contents.map((text) => ({
        translatedText: `${body.targetLanguageCode}:${text}`,
      })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
const ai = createGoogleAi(testEnv(FLAGS), {
  fetch: fetchMock,
  getAuthHeaders: async () => ({ Authorization: "Bearer t" }),
});

const t = useTestApp(FLAGS, { ai });

async function createNotice(
  buildingId: string,
  values: { endsAt?: Date; publishedAt?: Date } = {},
) {
  const now = Date.now();
  const [row] = await t.db
    .insert(notices)
    .values({
      buildingId,
      title: "물탱크 청소",
      body: "오전에 단수돼요",
      startsAt: new Date(now - DAY_MS),
      endsAt: values.endsAt ?? new Date(now + DAY_MS),
      publishedAt: values.publishedAt ?? new Date(now - DAY_MS),
    })
    .returning();
  if (!row) throw new Error("notice insert failed");
  return row;
}

describe("guide translation", () => {
  it("translates a published guide once and serves the cache until the content changes", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const guide = await createGuide(t.db, building.id, { status: "published" });
    fetchMock.mockClear();
    // When
    const first = await t.app.request(`/api/guides/${guide.id}/translation?lang=en`);
    const second = await t.app.request(`/api/guides/${guide.id}/translation?lang=en`);
    // Then
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      lang: "en",
      title: "en:published 안내",
      body: "en:본문",
    });
    expect(await second.json()).toMatchObject({ title: "en:published 안내" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // When: 다른 언어는 따로, 내용이 바뀌면 다시 번역합니다
    await t.app.request(`/api/guides/${guide.id}/translation?lang=vi`);
    await t.db.update(guides).set({ body: "새 본문" }).where(eq(guides.id, guide.id));
    const changed = await t.app.request(`/api/guides/${guide.id}/translation?lang=en`);
    // Then
    expect(await changed.json()).toMatchObject({ body: "en:새 본문" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const rows = await t.db
      .select()
      .from(contentTranslations)
      .where(eq(contentTranslations.guideId, guide.id));
    expect(rows.map((row) => row.lang).sort()).toEqual(["en", "vi"]);
  });

  it("hides drafts even from the landlord and rejects unknown languages", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const draft = await createGuide(t.db, building.id, { status: "draft" });
    const published = await createGuide(t.db, building.id, { status: "published" });
    fetchMock.mockClear();
    // When
    const hidden = await t.app.request(
      `/api/guides/${draft.id}/translation?lang=en`,
      withCookie(managerCookie),
    );
    const missing = await t.app.request(`/api/guides/${crypto.randomUUID()}/translation?lang=en`);
    const badLang = await t.app.request(`/api/guides/${published.id}/translation?lang=ja`);
    const noLang = await t.app.request(`/api/guides/${published.id}/translation`);
    // Then
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(badLang.status).toBe(400);
    expect(noLang.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes cached translations together with the guide", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const guide = await createGuide(t.db, building.id, { status: "published" });
    await t.app.request(`/api/guides/${guide.id}/translation?lang=zh-CN`);
    // When
    await t.db.delete(guides).where(eq(guides.id, guide.id));
    // Then
    const rows = await t.db
      .select()
      .from(contentTranslations)
      .where(eq(contentTranslations.guideId, guide.id));
    expect(rows).toEqual([]);
  });
});

describe("notice translation", () => {
  it("follows the notice detail rules: running ones only, 410 once ended", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const running = await createNotice(building.id);
    const ended = await createNotice(building.id, { endsAt: new Date(Date.now() - 1000) });
    const scheduled = await createNotice(building.id, {
      publishedAt: new Date(Date.now() + DAY_MS),
    });
    // When
    const ok = await t.app.request(`/api/notices/${running.id}/translation?lang=vi`);
    const gone = await t.app.request(`/api/notices/${ended.id}/translation?lang=vi`);
    const notYet = await t.app.request(`/api/notices/${scheduled.id}/translation?lang=vi`);
    // Then
    expect(await ok.json()).toEqual({
      lang: "vi",
      title: "vi:물탱크 청소",
      body: "vi:오전에 단수돼요",
    });
    expect(gone.status).toBe(410);
    expect(await gone.json()).toEqual({ error: { code: "NOTICE_ENDED" } });
    expect(notYet.status).toBe(404);
  });
});

describe("translation limits", () => {
  it("counts only cache misses per client and stops at the limit", async () => {
    // Given: 이 IP의 새 번역 한도를 다 쓴 상태
    const building = await createBuilding(t.db, "open");
    const cached = await createGuide(t.db, building.id, { status: "published" });
    await t.app.request(`/api/guides/${cached.id}/translation?lang=en`);
    const fresh = await createGuide(t.db, building.id, { status: "published", position: 2 });
    await t.db
      .update(rateLimits)
      .set({ hitCount: TRANSLATION_IP_LIMIT.limit })
      .where(eq(rateLimits.bucket, "translation"));
    fetchMock.mockClear();
    // When
    const hit = await t.app.request(`/api/guides/${cached.id}/translation?lang=en`);
    const miss = await t.app.request(`/api/guides/${fresh.id}/translation?lang=en`);
    // Then
    expect(hit.status).toBe(200);
    expect(miss.status).toBe(429);
    expect(miss.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(fetchMock).not.toHaveBeenCalled();
    await t.db.delete(rateLimits).where(eq(rateLimits.bucket, "translation"));
  });

  it("has a daily cap for the whole server", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const guide = await createGuide(t.db, building.id, { status: "published" });
    await t.db
      .insert(rateLimits)
      .values({
        bucket: "translation_daily",
        subjectKey: "all",
        hitCount: TRANSLATION_DAILY_LIMIT.limit,
      })
      .onConflictDoUpdate({
        target: [rateLimits.bucket, rateLimits.subjectKey],
        set: { hitCount: TRANSLATION_DAILY_LIMIT.limit },
      });
    // When
    const response = await t.app.request(`/api/guides/${guide.id}/translation?lang=en`);
    // Then
    expect(response.status).toBe(429);
    await t.db.delete(rateLimits).where(eq(rateLimits.bucket, "translation_daily"));
  });

  it("counts the daily cap in characters, not requests", async () => {
    // Given
    await t.db.delete(rateLimits).where(eq(rateLimits.bucket, "translation_daily"));
    const building = await createBuilding(t.db, "open");
    const guide = await createGuide(t.db, building.id, { status: "published" });
    // When
    const response = await t.app.request(`/api/guides/${guide.id}/translation?lang=en`);
    // Then
    expect(response.status).toBe(200);
    const [row] = await t.db
      .select({ hitCount: rateLimits.hitCount })
      .from(rateLimits)
      .where(eq(rateLimits.bucket, "translation_daily"));
    expect(row?.hitCount).toBe(guide.title.length + guide.body.length);
    await t.db.delete(rateLimits).where(eq(rateLimits.bucket, "translation_daily"));
  });

  it("answers 502 when Google fails and caches nothing", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const guide = await createGuide(t.db, building.id, { status: "published" });
    fetchMock.mockImplementationOnce(async () => new Response("{}", { status: 500 }));
    // When
    const response = await t.app.request(`/api/guides/${guide.id}/translation?lang=en`);
    // Then
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "UPSTREAM_FAILED" } });
    const rows = await t.db
      .select()
      .from(contentTranslations)
      .where(eq(contentTranslations.guideId, guide.id));
    expect(rows).toEqual([]);
  });
});

describe("translation when TRANSLATION_ENABLED is off", () => {
  const off = useTestApp();

  it("answers 404 for every translation route", async () => {
    // Given
    const building = await createBuilding(off.db, "open");
    const guide = await createGuide(off.db, building.id, { status: "published" });
    // When
    const guideResponse = await off.app.request(`/api/guides/${guide.id}/translation?lang=en`);
    const noticeResponse = await off.app.request(
      `/api/notices/${crypto.randomUUID()}/translation?lang=xx`,
    );
    // Then
    expect(guideResponse.status).toBe(404);
    expect(noticeResponse.status).toBe(404);
  });
});
