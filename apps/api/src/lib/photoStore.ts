import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PHOTO_KEY_PATTERN } from "@wolgyeham/contracts";
import { type Env, photoStoreKind } from "./env.ts";
import { log } from "./log.ts";

export type StoredPhoto = {
  body: Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array>;
  contentType: string;
  size: number | undefined;
};

/**
 * 안내·공지 사진 파일 저장소. 키는 contracts `PhotoKey`(`buildings/<건물>/<id>.webp`)이고, 환경 접두사
 * (`PHOTO_PREFIX`)는 저장소가 붙입니다. 형식이 다른 키는 받지 않습니다(경로 탈출 방지).
 */
export interface PhotoStore {
  readonly kind: "local" | "s3" | "memory";
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** 없으면 null. */
  get(key: string): Promise<StoredPhoto | null>;
  exists(key: string): Promise<boolean>;
  /** 없어도 성공입니다. */
  delete(key: string): Promise<void>;
  /** 건물 하나의 사진을 모두 지웁니다(`buildings/<건물 id>/`, 시연 초기화). 지운 수를 돌려줍니다. */
  deletePrefix(prefix: string): Promise<number>;
}

function checkKey(key: string) {
  if (!PHOTO_KEY_PATTERN.test(key)) throw new Error("invalid photo key");
}

const BUILDING_PREFIX_PATTERN =
  /^buildings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/;

function checkPrefix(prefix: string) {
  if (!BUILDING_PREFIX_PATTERN.test(prefix)) throw new Error("invalid photo prefix");
}

/** 건물 사진 접두사. */
export function buildingPhotoPrefix(buildingId: string) {
  return `buildings/${buildingId.toLowerCase()}/`;
}

/**
 * 건물들의 사진 파일을 지웁니다(시연 초기화: API `POST /dev/reset`, CLI `db:seed --reset-demo`). 행을 지운 뒤
 * 부르고, 실패해도 초기화는 성공으로 두고 로그만 남깁니다(파일이 남을 뿐 어떤 행도 가리키지 않아 보이지 않음).
 */
export async function deleteBuildingPhotos(
  photos: PhotoStore | null,
  buildingIds: readonly string[],
) {
  if (!photos) return;
  let deleted = 0;
  for (const id of buildingIds) {
    try {
      deleted += await photos.deletePrefix(buildingPhotoPrefix(id));
    } catch (error) {
      log("error", "photo_prefix_delete_failed", {
        name: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  log("info", "photo_prefix_deleted", { buildings: buildingIds.length, photos: deleted });
}

/** 테스트용. 프로세스 메모리에만 둡니다. */
export function createMemoryPhotoStore(): PhotoStore & { readonly size: number } {
  const files = new Map<string, { bytes: Uint8Array<ArrayBuffer>; contentType: string }>();
  return {
    kind: "memory",
    get size() {
      return files.size;
    },
    async put(key, bytes, contentType) {
      checkKey(key);
      files.set(key, { bytes: new Uint8Array(bytes), contentType });
    },
    async get(key) {
      checkKey(key);
      const file = files.get(key);
      return file
        ? { body: file.bytes, contentType: file.contentType, size: file.bytes.length }
        : null;
    },
    async exists(key) {
      checkKey(key);
      return files.has(key);
    },
    async delete(key) {
      checkKey(key);
      files.delete(key);
    },
    async deletePrefix(prefix) {
      checkPrefix(prefix);
      let count = 0;
      for (const key of [...files.keys()]) {
        if (key.startsWith(prefix)) {
          files.delete(key);
          count += 1;
        }
      }
      return count;
    },
  };
}

function isMissing(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "ENOENT"
  );
}

/**
 * 로컬 폴더(`PHOTO_LOCAL_DIR/PHOTO_PREFIX/키`). 로컬 개발용입니다. 내용 형식은 항상 WebP라 따로 저장하지 않습니다.
 * 쓰기는 임시 파일에 쓴 뒤 이름을 바꿔, 읽는 쪽이 반쯤 쓴 파일을 보지 않게 합니다.
 */
export function createLocalPhotoStore(directory: string, prefix_ = ""): PhotoStore {
  const root = path.resolve(directory);
  const fileOf = (key: string) => {
    checkKey(key);
    return path.join(root, prefix_, key);
  };
  return {
    kind: "local",
    async put(key, bytes) {
      const file = fileOf(key);
      await mkdir(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      await writeFile(temp, bytes);
      await rename(temp, file);
    },
    async get(key) {
      try {
        const bytes = await readFile(fileOf(key));
        return { body: new Uint8Array(bytes), contentType: "image/webp", size: bytes.length };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async exists(key) {
      try {
        return (await stat(fileOf(key))).isFile();
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },
    async delete(key) {
      await rm(fileOf(key), { force: true });
    },
    async deletePrefix(prefix) {
      checkPrefix(prefix);
      const dir = path.join(root, prefix_, prefix);
      let count = 0;
      try {
        count = (await readdir(dir)).filter((name) => name.endsWith(".webp")).length;
      } catch (error) {
        if (isMissing(error)) return 0;
        throw error;
      }
      await rm(dir, { recursive: true, force: true });
      return count;
    },
  };
}

/**
 * S3 버킷(`PHOTO_BUCKET`, 키는 `PHOTO_PREFIX` + 키). 자격 증명은 SDK 기본 체인(EC2 인스턴스 역할)에서 받고 환경
 * 변수에 키를 두지 않습니다. 필요한 권한: 이 접두사 아래 `s3:PutObject`·`s3:GetObject`·`s3:DeleteObject`
 * (HeadObject는 GetObject 권한으로 됨, docs/deploy.md).
 */
export function createS3PhotoStore(options: {
  bucket: string;
  prefix: string;
  region: string;
  client?: S3Client;
}): PhotoStore {
  // 응답이 늦으면 오래 붙잡지 않고 한 번만 다시 시도합니다(요청 10초, 연결 3초).
  const client =
    options.client ??
    new S3Client({
      region: options.region,
      maxAttempts: 2,
      requestHandler: { requestTimeout: 10_000, connectionTimeout: 3_000 },
    });
  const objectKey = (key: string) => {
    checkKey(key);
    return `${options.prefix}${key}`;
  };
  return {
    kind: "s3",
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: objectKey(key),
          Body: bytes,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    },
    async get(key) {
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: options.bucket, Key: objectKey(key) }),
        );
        if (!result.Body) return null;
        return {
          body: result.Body.transformToWebStream() as ReadableStream<Uint8Array>,
          contentType: result.ContentType ?? "image/webp",
          size: result.ContentLength,
        };
      } catch (error) {
        if (error instanceof NoSuchKey) return null;
        throw error;
      }
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: options.bucket, Key: objectKey(key) }));
        return true;
      } catch (error) {
        if (error instanceof NotFound || error instanceof NoSuchKey) return false;
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: objectKey(key) }));
    },
    // 목록(ListObjectsV2, 1000개씩)을 받아 DeleteObjects로 지웁니다. 권한: s3:ListBucket, s3:DeleteObject.
    async deletePrefix(prefix) {
      checkPrefix(prefix);
      let count = 0;
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: options.bucket,
            Prefix: `${options.prefix}${prefix}`,
            ...(token ? { ContinuationToken: token } : {}),
          }),
        );
        const keys = (page.Contents ?? []).flatMap((item) => (item.Key ? [{ Key: item.Key }] : []));
        if (keys.length > 0) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: options.bucket,
              Delete: { Objects: keys, Quiet: true },
            }),
          );
          count += keys.length;
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return count;
    },
  };
}

type PhotoEnv = Pick<
  Env,
  "NODE_ENV" | "PHOTO_STORE" | "PHOTO_BUCKET" | "PHOTO_PREFIX" | "PHOTO_LOCAL_DIR" | "AWS_REGION"
>;

/** 환경 변수로 저장소를 만듭니다. 사진을 받지 않는 환경(`off`)이면 null입니다. */
export function createPhotoStore(env: PhotoEnv): PhotoStore | null {
  const kind = photoStoreKind(env);
  if (kind === "off") return null;
  if (kind === "s3") {
    if (!env.PHOTO_BUCKET) return null;
    return createS3PhotoStore({
      bucket: env.PHOTO_BUCKET,
      prefix: env.PHOTO_PREFIX,
      region: env.AWS_REGION,
    });
  }
  return createLocalPhotoStore(env.PHOTO_LOCAL_DIR, env.PHOTO_PREFIX);
}
