import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NotFound, type S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.ts";
import {
  buildingPhotoPrefix,
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
