import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { NotFound, type S3Client } from "@aws-sdk/client-s3";
import type { Bucket } from "@google-cloud/storage";
import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.ts";
import {
  buildingPhotoPrefix,
  createGcsPhotoStore,
  createLocalPhotoStore,
  createMemoryPhotoStore,
  createPhotoStore,
  createS3PhotoStore,
} from "./photoStore.ts";

const KEY =
  "buildings/5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01/5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f02.webp";
const base = { DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db", APP_ORIGIN: "http://localhost" };

describe("local photo store", () => {
  it("writes under the prefix, reads back, deletes, and refuses keys outside the pattern", async () => {
    // Given
    const dir = await mkdtemp(path.join(tmpdir(), "wh-photos-"));
    const store = createLocalPhotoStore(dir, "dev/");
    try {
      // When
      await store.put(KEY, new Uint8Array([1, 2, 3]), "image/webp");
      // Then
      expect(await readdir(path.join(dir, "dev/buildings"))).toHaveLength(1);
      expect(await store.exists(KEY)).toBe(true);
      expect((await store.get(KEY))?.body).toEqual(new Uint8Array([1, 2, 3]));
      await store.delete(KEY);
      expect(await store.get(KEY)).toBeNull();
      await expect(store.put("../../etc/passwd", new Uint8Array(), "x")).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("S3 photo store", () => {
  it("prefixes object keys and maps missing objects to null/false", async () => {
    // Given
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    const client = {
      send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: command.constructor.name, input: command.input });
        if (command.constructor.name === "HeadObjectCommand") {
          throw new NotFound({ message: "missing", $metadata: {} });
        }
        return {};
      },
    } as unknown as S3Client;
    const store = createS3PhotoStore({
      bucket: "b",
      prefix: "prod/",
      region: "ap-northeast-2",
      client,
    });

    // When
    await store.put(KEY, new Uint8Array([1]), "image/webp");
    const exists = await store.exists(KEY);
    const got = await store.get(KEY);
    await store.delete(KEY);

    // Then
    expect(exists).toBe(false);
    expect(got).toBeNull();
    expect(sent.map((call) => call.name)).toEqual([
      "PutObjectCommand",
      "HeadObjectCommand",
      "GetObjectCommand",
      "DeleteObjectCommand",
    ]);
    expect(
      sent.every((call) => call.input["Key"] === `prod/${KEY}` && call.input["Bucket"] === "b"),
    ).toBe(true);
    expect(sent[0]?.input["ContentType"]).toBe("image/webp");
  });

  it("is not created in production without configuration", () => {
    expect(createPhotoStore(parseEnv({ ...base, NODE_ENV: "production" }))).toBeNull();
    expect(
      createPhotoStore(
        parseEnv({ ...base, PHOTO_STORE: "s3", PHOTO_BUCKET: "bucket-a", PHOTO_PREFIX: "dev/" }),
      )?.kind,
    ).toBe("s3");
  });
});

describe("photo prefix delete", () => {
  it("deletes only the building's photos in the memory and local stores", async () => {
    // Given
    const other = KEY.replace("4f01", "4f09");
    const memory = createMemoryPhotoStore();
    const dir = await mkdtemp(path.join(tmpdir(), "wh-photos-"));
    const local = createLocalPhotoStore(dir, "dev/");
    try {
      for (const store of [memory, local]) {
        await store.put(KEY, new Uint8Array([1]), "image/webp");
        await store.put(other, new Uint8Array([1]), "image/webp");
      }

      // When
      const counts = await Promise.all(
        [memory, local].map((store) =>
          store.deletePrefix(buildingPhotoPrefix("5A3E1C9D-2B47-4F86-9D10-7C2E5B8A4F01")),
        ),
      );

      // Then
      expect(counts).toEqual([1, 1]);
      for (const store of [memory, local]) {
        expect(await store.exists(KEY)).toBe(false);
        expect(await store.exists(other)).toBe(true);
      }
      await expect(memory.deletePrefix("buildings/")).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("lists and batch-deletes S3 objects page by page", async () => {
    // Given
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    let page = 0;
    const client = {
      send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: command.constructor.name, input: command.input });
        if (command.constructor.name === "ListObjectsV2Command") {
          page += 1;
          return page === 1
            ? {
                Contents: [{ Key: "dev/a" }, { Key: "dev/b" }],
                IsTruncated: true,
                NextContinuationToken: "t",
              }
            : { Contents: [{ Key: "dev/c" }], IsTruncated: false };
        }
        return {};
      },
    } as unknown as S3Client;
    const store = createS3PhotoStore({
      bucket: "b",
      prefix: "dev/",
      region: "ap-northeast-2",
      client,
    });

    // When
    const count = await store.deletePrefix(
      buildingPhotoPrefix("5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01"),
    );

    // Then
    expect(count).toBe(3);
    expect(sent.map((call) => call.name)).toEqual([
      "ListObjectsV2Command",
      "DeleteObjectsCommand",
      "ListObjectsV2Command",
      "DeleteObjectsCommand",
    ]);
    expect(sent[0]?.input["Prefix"]).toBe("dev/buildings/5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01/");
    expect(sent[2]?.input["ContinuationToken"]).toBe("t");
  });
});

/** 객체 이름 → 내용을 기억하는 가짜 GCS 버킷. 받은 호출을 `calls`에 남깁니다. */
function fakeBucket(pageSize = 1000) {
  const objects = new Map<string, { bytes: Buffer; contentType: string | undefined }>();
  const calls: { name: string; target: string; options?: unknown }[] = [];
  const notFound = () => Object.assign(new Error("No such object"), { code: 404 });
  const file = (target: string) => ({
    name: target,
    async save(bytes: Buffer, options: { contentType?: string }) {
      calls.push({ name: "save", target, options });
      objects.set(target, { bytes: Buffer.from(bytes), contentType: options.contentType });
    },
    async getMetadata() {
      calls.push({ name: "getMetadata", target });
      const object = objects.get(target);
      if (!object) throw notFound();
      return [{ contentType: object.contentType, size: String(object.bytes.length) }];
    },
    createReadStream() {
      calls.push({ name: "createReadStream", target });
      return Readable.from([objects.get(target)?.bytes ?? Buffer.alloc(0)]);
    },
    async exists() {
      calls.push({ name: "exists", target });
      return [objects.has(target)];
    },
    async delete(options: { ignoreNotFound?: boolean }) {
      calls.push({ name: "delete", target, options });
      if (!objects.delete(target) && !options.ignoreNotFound) throw notFound();
      return [{}];
    },
  });
  const bucket = {
    file,
    async getFiles(query: { prefix: string; maxResults: number; pageToken?: string }) {
      calls.push({ name: "getFiles", target: query.prefix, options: query });
      // 실제 GCS처럼 이름 순으로, 다음 쪽은 마지막 이름 뒤부터 줍니다(지우는 중이어도 건너뛰지 않음).
      const after = query.pageToken ?? "";
      const names = [...objects.keys()]
        .filter((name) => name.startsWith(query.prefix) && name > after)
        .sort();
      const page = names.slice(0, Math.min(pageSize, query.maxResults));
      return [
        page.map(file),
        names.length > page.length ? { ...query, pageToken: page.at(-1) } : null,
        {},
      ];
    },
  };
  return { bucket: bucket as unknown as Bucket, objects, calls };
}

describe("GCS photo store", () => {
  it("prefixes object names, streams the body back, and maps missing objects to null/false", async () => {
    // Given
    const { bucket, objects, calls } = fakeBucket();
    const store = createGcsPhotoStore({ bucket: "b", prefix: "gcp/", client: bucket });

    // When
    const before = await store.get(KEY);
    await store.put(KEY, new Uint8Array([1, 2, 3]), "image/webp");
    const exists = await store.exists(KEY);
    const got = await store.get(KEY);
    const body = got ? Buffer.from(await new Response(got.body).arrayBuffer()) : null;
    await store.delete(KEY);
    await store.delete(KEY);

    // Then
    expect(before).toBeNull();
    expect(exists).toBe(true);
    expect(got).toMatchObject({ contentType: "image/webp", size: 3 });
    expect(body).toEqual(Buffer.from([1, 2, 3]));
    expect(objects.size).toBe(0);
    expect(await store.exists(KEY)).toBe(false);
    expect(calls.every((call) => call.target === `gcp/${KEY}`)).toBe(true);
    expect(calls.find((call) => call.name === "save")?.options).toMatchObject({
      resumable: false,
      contentType: "image/webp",
    });
    await expect(store.put("../../etc/passwd", new Uint8Array(), "x")).rejects.toThrow();
    await expect(store.get("gcp/../x.webp")).rejects.toThrow();
  });

  it("deletes only the building's objects page by page", async () => {
    // Given
    const { bucket, objects, calls } = fakeBucket(2);
    const store = createGcsPhotoStore({ bucket: "b", prefix: "gcp/", client: bucket });
    const other = KEY.replace("4f01/", "4f09/");
    for (const id of ["a", "b", "c"]) {
      await store.put(KEY.replace("4f02", `4f0${id}`), new Uint8Array([1]), "image/webp");
    }
    await store.put(other, new Uint8Array([1]), "image/webp");
    objects.set(`dev/${KEY}`, { bytes: Buffer.from([1]), contentType: "image/webp" });

    // When
    const count = await store.deletePrefix(
      buildingPhotoPrefix("5A3E1C9D-2B47-4F86-9D10-7C2E5B8A4F01"),
    );

    // Then
    expect(count).toBe(3);
    expect([...objects.keys()].sort()).toEqual([`dev/${KEY}`, `gcp/${other}`]);
    const pages = calls.filter((call) => call.name === "getFiles");
    expect(pages).toHaveLength(2);
    expect(pages[0]?.target).toBe("gcp/buildings/5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01/");
    await expect(store.deletePrefix("buildings/")).rejects.toThrow();
  });

  it("is created from the environment with a bucket and prefix", () => {
    expect(
      createPhotoStore(
        parseEnv({ ...base, PHOTO_STORE: "gcs", PHOTO_BUCKET: "bucket-a", PHOTO_PREFIX: "gcp/" }),
      )?.kind,
    ).toBe("gcs");
  });
});
