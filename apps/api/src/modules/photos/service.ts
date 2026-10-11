import { randomUUID } from "node:crypto";
import {
  PHOTO_KEY_PATTERN,
  PHOTO_UPLOAD_MAX_BYTES,
  PHOTO_UPLOAD_TYPES,
  PHOTOS_MAX,
  type Photo,
  type PhotoConfig,
  photoUrl,
  type UploadPhotoResult,
} from "@wolgyeham/contracts";
import { isManager, requireManager } from "../../lib/auth.ts";
import type { SessionUser } from "../../lib/context.ts";
import type { Database } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import { log } from "../../lib/log.ts";
import {
  isPhotoQueueFull,
  normalizePhoto,
  PhotoBusyError,
  PhotoDecodeError,
  sniffImageType,
} from "../../lib/photoImage.ts";
import type { PhotoStore, StoredPhoto } from "../../lib/photoStore.ts";
import { hitRateLimit } from "../../lib/rate-limit.ts";
import * as buildingService from "../buildings/service.ts";
import * as repo from "./repo.ts";

/** 사진 올리기 반복 제한: 사용자마다 1시간에 60장(안내 여러 개를 쓰며 다시 고르는 정도). */
const UPLOAD_LIMIT = { limit: 60, windowSeconds: 60 * 60 };

export function getConfig(store: PhotoStore | null): PhotoConfig {
  return {
    uploadsEnabled: store !== null,
    maxPhotos: PHOTOS_MAX,
    maxUploadBytes: PHOTO_UPLOAD_MAX_BYTES,
  };
}

function requireStore(store: PhotoStore | null): PhotoStore {
  if (!store) throw new AppError(503, "PHOTO_STORAGE_UNAVAILABLE");
  return store;
}

export function keyOf(buildingId: string, file: string) {
  return `buildings/${buildingId}/${file}`;
}

/** 저장한 키들을 응답 모양으로 바꿉니다. */
export function toPhotos(keys: readonly string[]): Photo[] {
  return keys.map((key) => ({ key, url: photoUrl(key) }));
}

/** 처리 줄이 가득 찼을 때 다시 시도하라고 알리는 초. */
const BUSY_RETRY_SECONDS = 5;

function busy() {
  return new AppError(429, "RATE_LIMITED", undefined, {
    "Retry-After": String(BUSY_RETRY_SECONDS),
  });
}

/**
 * 사진 올리기의 앞부분. 본문(multipart)을 읽기 전에 부릅니다: 건물·집주인 확인, 저장소, 반복 제한, 처리 줄.
 * 집주인이 아니면 큰 본문을 받기 전에 끝납니다(본문 한도도 이 뒤에 적용, routes.ts).
 */
export async function beginUpload(
  db: Database,
  photos: PhotoStore | null,
  userId: string,
  buildingId: string,
): Promise<{ store: PhotoStore; buildingId: string }> {
  const building = await buildingService.requireBuilding(db, buildingId);
  await requireManager(db, userId, building.id);
  const store = requireStore(photos);
  await hitRateLimit(db, "photo_upload", userId, UPLOAD_LIMIT);
  if (isPhotoQueueFull()) throw busy();
  return { store, buildingId: building.id };
}

/**
 * 사진 올리기(집주인, `beginUpload` 다음). 앞 바이트로 JPEG·PNG·WebP인지 보고(보낸 형식과도 같아야 함), 서버에서
 * 다시 만들어(방향 보정, 메타데이터·위치 정보 제거, 긴 변 1600px, WebP) 저장합니다. 아직 어떤 안내·공지에도
 * 붙지 않은 사진이라 이 건물 집주인만 볼 수 있습니다.
 */
export async function upload(
  target: { store: PhotoStore; buildingId: string },
  file: unknown,
): Promise<UploadPhotoResult> {
  const { store } = target;
  if (!(file instanceof File) || file.size === 0) {
    throw new AppError(400, "VALIDATION_FAILED", { file: "an image file is required" });
  }
  if (file.size > PHOTO_UPLOAD_MAX_BYTES) throw new AppError(413, "PAYLOAD_TOO_LARGE");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  const declared = file.type.toLowerCase();
  if (!type || !(PHOTO_UPLOAD_TYPES as readonly string[]).includes(declared) || declared !== type) {
    throw new AppError(400, "PHOTO_INVALID");
  }
  let output: Uint8Array;
  try {
    output = (await normalizePhoto(bytes, type)).bytes;
  } catch (error) {
    if (error instanceof PhotoDecodeError) throw new AppError(400, "PHOTO_INVALID");
    if (error instanceof PhotoBusyError) throw busy();
    throw error;
  }
  const key = keyOf(target.buildingId, `${randomUUID()}.webp`);
  await store.put(key, output, "image/webp");
  return { photo: { key, url: photoUrl(key) } };
}

/**
 * 사진 파일 하나를 볼 수 있는지. 공개된 안내나 지금 보이는 공지에 붙은 사진은 누구나(`public`), 그 밖의 사진
 * (초안·수정본·아직 붙이지 않은 사진)은 그 건물 집주인만(`private`) 봅니다. 볼 수 없으면 있는지도 알리지 않고 404.
 * 경로의 id는 소문자로 맞춥니다(키는 항상 소문자 uuid).
 */
export async function photoAccess(
  db: Database,
  photos: PhotoStore | null,
  user: SessionUser | null,
  buildingId: string,
  file: string,
): Promise<{ store: PhotoStore; key: string; visibility: "public" | "private" }> {
  if (!photos) throw new AppError(404, "NOT_FOUND");
  const building = buildingId.toLowerCase();
  const key = keyOf(building, file.toLowerCase());
  if (!PHOTO_KEY_PATTERN.test(key)) throw new AppError(404, "NOT_FOUND");
  if (await repo.isPublicPhoto(db, building, key))
    return { store: photos, key, visibility: "public" };
  if (user && (await isManager(db, user.id, building))) {
    return { store: photos, key, visibility: "private" };
  }
  throw new AppError(404, "NOT_FOUND");
}

/** 볼 수 있는 사진의 파일. 저장소에 없으면 404. */
export async function readPhoto(store: PhotoStore, key: string): Promise<StoredPhoto> {
  const photo = await store.get(key);
  if (!photo) throw new AppError(404, "NOT_FOUND");
  return photo;
}

/**
 * 안내·공지에 붙일 사진 키를 확인합니다. 이 건물에 올린 키(`buildings/<이 건물>/`)이고 저장소에 있어야 합니다.
 * 아니면 400 `VALIDATION_FAILED`(`photos.<순서>`). 사진이 없으면 저장소가 없는 환경에서도 통과합니다.
 */
export async function requirePhotoKeys(
  photos: PhotoStore | null,
  buildingId: string,
  keys: readonly string[],
) {
  if (keys.length === 0) return;
  const store = requireStore(photos);
  const prefix = keyOf(buildingId, "");
  const found = await Promise.all(
    keys.map((key) => (key.startsWith(prefix) ? store.exists(key) : false)),
  );
  const fields: Record<string, string> = {};
  found.forEach((ok, index) => {
    if (!ok) fields[`photos.${index}`] = "photo not found in this building";
  });
  if (Object.keys(fields).length > 0) throw new AppError(400, "VALIDATION_FAILED", fields);
}

/**
 * 안내에서 빠진 사진 파일을 지웁니다. 이 건물의 다른 행(초안·공개 안내·수정본·공지)이 아직 쓰면 남깁니다.
 * 트랜잭션이 끝난 뒤 부르고, 실패해도 요청은 성공으로 두고 로그만 남깁니다(파일이 남을 뿐 보이지 않음).
 */
export async function releasePhotos(
  db: Database,
  photos: PhotoStore | null,
  buildingId: string,
  keys: readonly string[],
) {
  if (!photos || keys.length === 0) return;
  for (const key of new Set(keys)) {
    try {
      if (!(await repo.isReferencedPhoto(db, buildingId, key))) await photos.delete(key);
    } catch (error) {
      log("error", "photo_release_failed", {
        name: error instanceof Error ? error.name : "unknown",
      });
    }
  }
}

/** `before`에 있었는데 `after`에 없는 키. */
export function removedKeys(before: readonly string[], after: readonly string[]) {
  const kept = new Set(after);
  return before.filter((key) => !kept.has(key));
}
