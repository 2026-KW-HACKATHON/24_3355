import { randomUUID } from "node:crypto";
import { PHOTO_KEY_PATTERN } from "@wolgyeham/contracts";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { guides, notices, rateLimits } from "../../db/schema.ts";
import {
  createBuilding,
  createGuide,
  createManagedBuilding,
  createUser,
  jsonRequest,
  sessionCookie,
  TEST_ORIGIN,
  useTestApp,
  withCookie,
} from "../../test/helpers.ts";
import { beginUpload, PHOTO_PENDING_UPLOADS_MAX } from "./service.ts";

const t = useTestApp();

/** 휴대폰 사진처럼 EXIF 방향(6 = 시계 방향 90도)과 GPS 위치가 든 3000×2000 JPEG. */
async function phoneJpeg() {
  const bytes = new Uint8Array(
    await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 120, b: 40 } },
    })
      .jpeg({ quality: 70 })
      .withExifMerge({
        IFD0: { Make: "TestPhone" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 37/1 0/1" },
      })
      .withMetadata({ orientation: 6 })
      .toBuffer(),
  );
  const meta = await sharp(bytes).metadata();
  expect(meta.orientation).toBe(6);
  expect(meta.exif?.toString("latin1")).toContain("TestPhone");
  return bytes;
}

async function smallPng(width = 40, height = 30) {
  return new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: "#25355a" } })
      .png()
      .toBuffer(),
  );
}

function upload(
  buildingId: string,
  bytes: Uint8Array,
  options: { cookie?: string; type?: string; origin?: string | null; field?: string } = {},
) {
  const form = new FormData();
  form.append(
    options.field ?? "file",
    new File([bytes as Uint8Array<ArrayBuffer>], "photo", { type: options.type ?? "image/jpeg" }),
  );
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers["Origin"] = options.origin ?? TEST_ORIGIN;
  if (options.cookie) headers["Cookie"] = options.cookie;
  return t.app.request(`/api/buildings/${buildingId}/photos`, {
    method: "POST",
    body: form,
    headers,
  });
}

async function uploadKey(buildingId: string, cookie: string) {
  const response = await upload(buildingId, await smallPng(), { cookie, type: "image/png" });
  expect(response.status).toBe(201);
  const { photo } = (await response.json()) as { photo: { key: string; url: string } };
  return photo.key;
}

function getPhoto(key: string, cookie?: string) {
  return t.app.request(`/api/photos/${key}`, cookie ? { headers: { Cookie: cookie } } : {});
}

describe("POST /api/buildings/:buildingId/photos", () => {
  it("re-encodes a phone photo: rotates by EXIF, strips metadata, fits 1600px, WebP", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);

    // When
    const response = await upload(building.id, await phoneJpeg(), { cookie: managerCookie });

    // Then
    expect(response.status).toBe(201);
    const { photo } = (await response.json()) as { photo: { key: string; url: string } };
    expect(photo.key).toMatch(PHOTO_KEY_PATTERN);
    expect(photo.key.startsWith(`buildings/${building.id}/`)).toBe(true);
    expect(photo.url).toBe(`/api/photos/${photo.key}`);
    const stored = await t.photos?.get(photo.key);
    expect(stored?.contentType).toBe("image/webp");
    const meta = await sharp(stored?.body as Uint8Array).metadata();
    expect(meta.format).toBe("webp");
    // 3000×2000을 90도 돌려 2000×3000, 긴 변 1600에 맞춤
    expect(meta.width).toBe(1067);
    expect(meta.height).toBe(1600);
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it("does not enlarge small photos", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);

    // When
    const response = await upload(building.id, await smallPng(), {
      cookie: managerCookie,
      type: "image/png",
    });

    // Then
    expect(response.status).toBe(201);
    const { photo } = (await response.json()) as { photo: { key: string } };
    const meta = await sharp((await t.photos?.get(photo.key))?.body as Uint8Array).metadata();
    expect([meta.width, meta.height]).toEqual([40, 30]);
  });

  it("only lets the building's landlord upload", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db);
    const other = await createManagedBuilding(t.db);
    const residentCookie = await sessionCookie(t.db, await createUser(t.db));
    const bytes = await smallPng();

    // When
    const anonymous = await upload(building.id, bytes, { type: "image/png" });
    const resident = await upload(building.id, bytes, {
      type: "image/png",
      cookie: residentCookie,
    });
    const otherLandlord = await upload(building.id, bytes, {
      type: "image/png",
      cookie: other.managerCookie,
    });
    const missing = await upload(randomUUID(), bytes, {
      type: "image/png",
      cookie: other.managerCookie,
    });

    // Then
    expect(anonymous.status).toBe(401);
    expect(resident.status).toBe(403);
    expect(await resident.json()).toEqual({ error: { code: "NOT_BUILDING_MANAGER" } });
    expect(otherLandlord.status).toBe(403);
    expect(missing.status).toBe(404);
  });

  it("rejects uploads from another origin", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);

    // When
    const response = await upload(building.id, await smallPng(), {
      cookie: managerCookie,
      type: "image/png",
      origin: "https://evil.example",
    });

    // Then
    expect(response.status).toBe(403);
  });

  it("checks the file's first bytes, not just the declared type", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const png = await smallPng();
    const gif = new Uint8Array(await sharp(png).gif().toBuffer());
    const brokenJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 1, 2, 3]);

    // When (동시 올리기 수 한도에 걸리지 않게 차례로)
    const results = [];
    for (const [bytes, type] of [
      [svg, "image/jpeg"],
      [png, "image/jpeg"],
      [gif, "image/gif"],
      [png, "image/svg+xml"],
      [brokenJpeg, "image/jpeg"],
    ] as const) {
      results.push(await upload(building.id, bytes, { cookie: managerCookie, type }));
    }

    // Then
    for (const response of results) {
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: { code: "PHOTO_INVALID" } });
    }
  });

  it("requires a file field", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);

    // When
    const wrongField = await upload(building.id, await smallPng(), {
      cookie: managerCookie,
      type: "image/png",
      field: "photo",
    });
    const json = await t.app.request(
      `/api/buildings/${building.id}/photos`,
      jsonRequest("POST", { file: "x" }, managerCookie),
    );

    // Then
    expect(wrongField.status).toBe(400);
    expect(await wrongField.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(json.status).toBe(400);
  });

  it("rejects files over 8 MB, images over 4096×4096 pixels and 16-bit images", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const huge = new Uint8Array(8 * 1024 * 1024 + 1);
    huge.set([0xff, 0xd8, 0xff]);
    // 4200×4200 ≈ 1,764만 픽셀(상한 4096×4096 ≈ 1,678만)
    const tooManyPixels = await smallPng(4200, 4200);
    const sixteenBit = new Uint8Array(
      await sharp({ create: { width: 32, height: 32, channels: 3, background: "#808080" } })
        .toColourspace("rgb16")
        .png()
        .toBuffer(),
    );
    expect((await sharp(sixteenBit).metadata()).depth).toBe("ushort");

    // When
    const big = await upload(building.id, huge, { cookie: managerCookie });
    const pixels = await upload(building.id, tooManyPixels, {
      cookie: managerCookie,
      type: "image/png",
    });
    const deep = await upload(building.id, sixteenBit, {
      cookie: managerCookie,
      type: "image/png",
    });

    // Then
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: { code: "PAYLOAD_TOO_LARGE" } });
    expect(pixels.status).toBe(400);
    expect(await pixels.json()).toEqual({ error: { code: "PHOTO_INVALID" } });
    expect(deep.status).toBe(400);
    expect(await deep.json()).toEqual({ error: { code: "PHOTO_INVALID" } });
  });

  it("rejects a non-landlord before reading the body", async () => {
    // Given 본문 한도(8MB)를 넘는 요청이라도 집주인이 아니면 413이 아니라 403
    const { building } = await createManagedBuilding(t.db);
    const residentCookie = await sessionCookie(t.db, await createUser(t.db));
    const huge = new Uint8Array(9 * 1024 * 1024);
    huge.set([0xff, 0xd8, 0xff]);

    // When
    const response = await upload(building.id, huge, { cookie: residentCookie });

    // Then
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "NOT_BUILDING_MANAGER" } });
  });

  it("keeps the 64 KB body limit on other routes", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);

    // When
    const response = await t.app.request(
      `/api/buildings/${building.id}/guides`,
      jsonRequest(
        "POST",
        { category: "recycling", title: "제목", body: "가".repeat(70 * 1024) },
        managerCookie,
      ),
    );

    // Then
    expect(response.status).toBe(413);
  });

  it("answers 429 before reading the body while too many uploads are pending, and frees the slot after", async () => {
    // Given: 다른 올리기들이 본문을 받는 중이라 자리가 모두 찼음
    const { building, managerId, managerCookie } = await createManagedBuilding(t.db);
    const pending = [];
    for (let i = 0; i < PHOTO_PENDING_UPLOADS_MAX; i += 1) {
      pending.push(await beginUpload(t.db, t.photos, managerId, building.id));
    }

    // When
    const full = await upload(building.id, await smallPng(), {
      cookie: managerCookie,
      type: "image/png",
    });
    for (const target of pending) target.release();
    const freed = await upload(building.id, await smallPng(), {
      cookie: managerCookie,
      type: "image/png",
    });
    const again = await upload(building.id, await smallPng(), {
      cookie: managerCookie,
      type: "image/png",
    });

    // Then
    expect(full.status).toBe(429);
    expect(await full.json()).toEqual({ error: { code: "RATE_LIMITED" } });
    expect(full.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(freed.status).toBe(201);
    // 앞 요청이 끝나면 자리를 돌려줍니다(실패한 요청 포함).
    expect(again.status).toBe(201);
  });

  it("limits uploads per user to 60 an hour", async () => {
    // Given
    const { building, managerId, managerCookie } = await createManagedBuilding(t.db);
    await t.db
      .insert(rateLimits)
      .values({ bucket: "photo_upload", subjectKey: managerId, hitCount: 60 });

    // When
    const response = await upload(building.id, await smallPng(), {
      cookie: managerCookie,
      type: "image/png",
    });

    // Then
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toMatch(/^\d+$/);
  });
});

describe("GET /api/photos/buildings/:buildingId/:file", () => {
  it("shows an unattached or draft photo only to the landlord, privately", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const key = await uploadKey(building.id, managerCookie);
    const draft = await t.app.request(
      `/api/buildings/${building.id}/guides`,
      jsonRequest(
        "POST",
        { category: "recycling", title: "분리수거", body: "본문", photos: [key] },
        managerCookie,
      ),
    );
    expect(draft.status).toBe(201);
    const otherLandlord = await createManagedBuilding(t.db);

    // When
    const anonymous = await getPhoto(key);
    const other = await getPhoto(key, otherLandlord.managerCookie);
    const landlord = await getPhoto(key, managerCookie);

    // Then
    expect(anonymous.status).toBe(404);
    expect(other.status).toBe(404);
    expect(landlord.status).toBe(200);
    expect(landlord.headers.get("Content-Type")).toBe("image/webp");
    expect(landlord.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(landlord.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("shows a published guide's photo to everyone with a long public cache", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const key = await uploadKey(building.id, managerCookie);
    const created = await t.app.request(
      `/api/buildings/${building.id}/guides`,
      jsonRequest(
        "POST",
        { category: "parcel", title: "택배", body: "현관 선반", photos: [key] },
        managerCookie,
      ),
    );
    const guide = (await created.json()) as { id: string; photos: unknown };
    expect(guide.photos).toEqual([{ key, url: `/api/photos/${key}` }]);
    await t.app.request(
      `/api/guides/${guide.id}/publish`,
      withCookie(managerCookie, { method: "POST" }),
    );

    // When
    const response = await getPhoto(key);
    const publicGuide = await t.app.request(`/api/guides/${guide.id}`);

    // Then
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, no-cache");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const etag = response.headers.get("ETag");
    expect(etag).toBe(`"${key.split("/").at(-1)?.replace(".webp", "")}"`);
    expect(new Uint8Array(await response.arrayBuffer()).length).toBeGreaterThan(0);

    // When the browser revalidates with the ETag
    const again = await t.app.request(`/api/photos/${key}`, {
      headers: { "If-None-Match": etag ?? "" },
    });
    const other = await t.app.request(`/api/photos/${key}`, {
      headers: { "If-None-Match": '"something-else"' },
    });

    // Then
    expect(again.status).toBe(304);
    expect(again.headers.get("Cache-Control")).toBe("public, no-cache");
    expect(again.headers.get("ETag")).toBe(etag);
    expect(await again.text()).toBe("");
    expect(other.status).toBe(200);
    expect(((await publicGuide.json()) as { photos: unknown }).photos).toEqual([
      { key, url: `/api/photos/${key}` },
    ]);
  });

  it("shows a running notice's photo to everyone", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const key = await uploadKey(building.id, managerCookie);
    const now = Date.now();

    // When
    const created = await t.app.request(
      `/api/buildings/${building.id}/notices`,
      jsonRequest(
        "POST",
        {
          title: "단수 안내",
          body: "물탱크 청소",
          photos: [key],
          startsAt: new Date(now).toISOString(),
          endsAt: new Date(now + 60 * 60 * 1000).toISOString(),
        },
        managerCookie,
      ),
    );
    const response = await getPhoto(key);

    // Then
    expect(created.status).toBe(201);
    const { notice } = (await created.json()) as { notice: { id: string; photos: unknown } };
    expect(notice.photos).toEqual([{ key, url: `/api/photos/${key}` }]);
    const detail = await t.app.request(`/api/notices/${notice.id}`);
    expect(((await detail.json()) as { photos: unknown }).photos).toEqual(notice.photos);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, no-cache");

    // When the notice has ended
    await t.db
      .update(notices)
      .set({ startsAt: new Date(now - 7200_000), endsAt: new Date(now - 3600_000) })
      .where(eq(notices.id, notice.id));

    // Then
    expect((await getPhoto(key)).status).toBe(404);
  });

  it("does not serve a published photo under another building's path", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const key = await uploadKey(building.id, managerCookie);
    const guide = await createGuide(t.db, building.id, { status: "published" });
    await t.db
      .update(guides)
      .set({ photos: [key] })
      .where(eq(guides.id, guide.id));
    const other = await createBuilding(t.db);

    // When
    const moved = await t.app.request(`/api/photos/buildings/${other.id}/${key.split("/").at(-1)}`);
    const bad = await t.app.request(`/api/photos/buildings/${building.id}/..%2Fsecret.webp`);
    const upper = await t.app.request(
      `/api/photos/${key.toUpperCase().replace("BUILDINGS", "buildings").replace(".WEBP", ".webp")}`,
    );
    const upperMissing = await t.app.request(
      `/api/photos/buildings/${randomUUID().toUpperCase()}/${randomUUID().toUpperCase()}.webp`,
    );

    // Then
    expect((await getPhoto(key)).status).toBe(200);
    expect(moved.status).toBe(404);
    expect(bad.status).toBe(404);
    // 대문자 uuid도 같은 사진(키는 소문자로 맞춤), 없으면 500이 아니라 404
    expect(upper.status).toBe(200);
    expect(upperMissing.status).toBe(404);
  });
});

describe("photos on guides and notices", () => {
  it("accepts only up to four existing photos of this building", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const other = await createManagedBuilding(t.db);
    const foreign = await uploadKey(other.building.id, other.managerCookie);
    const keys = [];
    for (let i = 0; i < 5; i++) keys.push(await uploadKey(building.id, managerCookie));
    const ghost = `buildings/${building.id}/${randomUUID()}.webp`;
    const create = (photos: unknown) =>
      t.app.request(
        `/api/buildings/${building.id}/guides`,
        jsonRequest(
          "POST",
          { category: "recycling", title: "제목", body: "본문", photos },
          managerCookie,
        ),
      );

    // When
    const tooMany = await create(keys);
    const fromOther = await create([keys[0], foreign]);
    const missing = await create([ghost]);
    const duplicate = await create([keys[0], keys[0]]);
    const malformed = await create(["../../etc/passwd"]);
    const ok = await create(keys.slice(0, 4));

    // Then
    expect(tooMany.status).toBe(400);
    expect(fromOther.status).toBe(400);
    expect(await fromOther.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED", fields: { "photos.1": expect.any(String) } },
    });
    expect(missing.status).toBe(400);
    expect(duplicate.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { photos: unknown[] }).photos).toHaveLength(4);
  });

  it("validates notice photos the same way", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const ghost = `buildings/${building.id}/${randomUUID()}.webp`;
    const now = Date.now();

    // When
    const response = await t.app.request(
      `/api/buildings/${building.id}/notices`,
      jsonRequest(
        "POST",
        {
          title: "공지",
          body: "본문",
          photos: [ghost],
          startsAt: new Date(now).toISOString(),
          endsAt: new Date(now + 3600_000).toISOString(),
        },
        managerCookie,
      ),
    );

    // Then
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED", fields: { "photos.0": expect.any(String) } },
    });
  });

  it("keeps public photos until the revision is published, then swaps and deletes the old file", async () => {
    // Given a published guide with photo A
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const a = await uploadKey(building.id, managerCookie);
    const b = await uploadKey(building.id, managerCookie);
    const created = await t.app.request(
      `/api/buildings/${building.id}/guides`,
      jsonRequest(
        "POST",
        { category: "recycling", title: "분리수거", body: "본문", photos: [a] },
        managerCookie,
      ),
    );
    const { id } = (await created.json()) as { id: string };
    await t.app.request(`/api/guides/${id}/publish`, withCookie(managerCookie, { method: "POST" }));

    // When the landlord replaces A with B in a revision
    const saved = await t.app.request(
      `/api/guides/${id}`,
      jsonRequest("PATCH", { photos: [b] }, managerCookie),
    );

    // Then the public guide still shows A, the revision has B
    expect(saved.status).toBe(200);
    const managed = (await saved.json()) as {
      photos: { key: string }[];
      revision: { photos: { key: string }[] };
    };
    expect(managed.photos.map((photo) => photo.key)).toEqual([a]);
    expect(managed.revision.photos.map((photo) => photo.key)).toEqual([b]);
    expect((await getPhoto(a)).status).toBe(200);
    expect((await getPhoto(b)).status).toBe(404);

    // When the revision is published
    const published = await t.app.request(
      `/api/guides/${id}/publish`,
      withCookie(managerCookie, { method: "POST" }),
    );

    // Then B is public and A's file is gone
    expect(published.status).toBe(200);
    const result = (await published.json()) as { guide: { photos: { key: string }[] } };
    expect(result.guide.photos.map((photo) => photo.key)).toEqual([b]);
    expect((await getPhoto(b)).status).toBe(200);
    expect(await t.photos?.exists(a)).toBe(false);
    expect(await t.photos?.exists(b)).toBe(true);
  });

  it("deletes a revision-only photo when the revision is discarded, keeps shared ones", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const a = await uploadKey(building.id, managerCookie);
    const b = await uploadKey(building.id, managerCookie);
    const created = await t.app.request(
      `/api/buildings/${building.id}/guides`,
      jsonRequest(
        "POST",
        { category: "recycling", title: "분리수거", body: "본문", photos: [a] },
        managerCookie,
      ),
    );
    const { id } = (await created.json()) as { id: string };
    await t.app.request(`/api/guides/${id}/publish`, withCookie(managerCookie, { method: "POST" }));
    await t.app.request(
      `/api/guides/${id}`,
      jsonRequest("PATCH", { photos: [a, b] }, managerCookie),
    );

    // When
    const discarded = await t.app.request(
      `/api/guides/${id}/revision`,
      withCookie(managerCookie, { method: "DELETE" }),
    );

    // Then
    expect(discarded.status).toBe(204);
    expect(await t.photos?.exists(a)).toBe(true);
    expect(await t.photos?.exists(b)).toBe(false);
  });

  it("deletes a photo removed from a draft only when nothing else uses it", async () => {
    // Given two drafts sharing photo A, the first also with B
    const { building, managerCookie } = await createManagedBuilding(t.db);
    const a = await uploadKey(building.id, managerCookie);
    const b = await uploadKey(building.id, managerCookie);
    const create = (photos: string[]) =>
      t.app.request(
        `/api/buildings/${building.id}/guides`,
        jsonRequest(
          "POST",
          { category: "common", title: "공용", body: "본문", photos },
          managerCookie,
        ),
      );
    const first = (await (await create([a, b])).json()) as { id: string };
    await create([a]);

    // When
    const response = await t.app.request(
      `/api/guides/${first.id}`,
      jsonRequest("PATCH", { photos: [] }, managerCookie),
    );

    // Then
    expect(response.status).toBe(200);
    expect(await t.photos?.exists(a)).toBe(true);
    expect(await t.photos?.exists(b)).toBe(false);
  });
});

describe("GET /api/photos/config", () => {
  it("says uploads are enabled with a store", async () => {
    // When
    const response = await t.app.request("/api/photos/config");

    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      uploadsEnabled: true,
      maxPhotos: 4,
      maxUploadBytes: 8 * 1024 * 1024,
    });
  });
});

describe("without a photo store", () => {
  const off = useTestApp({}, { photos: null });

  it("reports uploads disabled and answers uploads with 503", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(off.db);
    const form = new FormData();
    form.append("file", new File([await smallPng()], "a.png", { type: "image/png" }));

    // When
    const config = await off.app.request("/api/photos/config");
    const uploaded = await off.app.request(`/api/buildings/${building.id}/photos`, {
      method: "POST",
      body: form,
      headers: { Origin: TEST_ORIGIN, Cookie: managerCookie },
    });
    const guide = await off.app.request(
      `/api/buildings/${building.id}/guides`,
      jsonRequest("POST", { category: "recycling", title: "제목", body: "본문" }, managerCookie),
    );

    // Then
    expect(await config.json()).toMatchObject({ uploadsEnabled: false });
    expect(uploaded.status).toBe(503);
    expect(await uploaded.json()).toEqual({ error: { code: "PHOTO_STORAGE_UNAVAILABLE" } });
    expect(guide.status).toBe(201);
  });
});
