import { z } from "zod";

/** 안내·공지 하나에 붙이는 사진 수. */
export const PHOTOS_MAX = 4;
/** 올리는 파일 하나의 크기 상한(바이트). 웹은 올리기 전에 긴 변 2048px JPEG로 줄입니다. */
export const PHOTO_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
/** 서버가 받는 원본 형식. HEIC는 받지 않습니다(웹이 브라우저에서 JPEG로 바꿈). */
export const PHOTO_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * 사진 키. `buildings/<건물 id>/<사진 id>.webp`이고, 저장소의 환경 접두사(`PHOTO_PREFIX`)는 넣지 않습니다.
 * 화면 주소는 `/api/photos/<키>`입니다.
 */
export const PHOTO_KEY_PATTERN =
  /^buildings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;
export const PhotoKey = z.string().regex(PHOTO_KEY_PATTERN);
export type PhotoKey = z.infer<typeof PhotoKey>;

/** 사진 키를 화면 주소로 바꿉니다(API와 웹이 같이 씀). */
export function photoUrl(key: string): string {
  return `/api/photos/${key}`;
}

/** 올린 사진 하나. 안내·공지 응답의 `photos`도 같은 모양입니다. */
export const Photo = z.object({ key: PhotoKey, url: z.string() });
export type Photo = z.infer<typeof Photo>;

/** 안내·공지에 붙일 사진 키 목록(최대 4개, 같은 키 두 번 안 됨). 순서대로 보여줍니다. */
export const PhotoKeys = z
  .array(PhotoKey)
  .max(PHOTOS_MAX)
  .refine((keys) => new Set(keys).size === keys.length, { message: "photos must be unique" });
export type PhotoKeys = z.infer<typeof PhotoKeys>;

/** `POST /buildings/:buildingId/photos`(집주인, multipart `file`)의 응답. */
export const UploadPhotoResult = z.object({ photo: Photo });
export type UploadPhotoResult = z.infer<typeof UploadPhotoResult>;

/** `GET /photos/config`. 서버에 사진 저장소가 없으면 `uploadsEnabled: false`이고 웹은 사진 추가를 숨깁니다. */
export const PhotoConfig = z.object({
  uploadsEnabled: z.boolean(),
  maxPhotos: z.number().int().min(0),
  maxUploadBytes: z.number().int().min(0),
});
export type PhotoConfig = z.infer<typeof PhotoConfig>;

export const PhotoFileParams = z.object({
  buildingId: z.uuid(),
  /** 대소문자는 가리지 않고, 서버가 소문자로 맞춥니다. */
  file: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i),
});
export type PhotoFileParams = z.infer<typeof PhotoFileParams>;
