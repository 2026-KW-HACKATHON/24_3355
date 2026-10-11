import {
  BuildingParams,
  PHOTO_UPLOAD_MAX_BYTES,
  PhotoConfig,
  PhotoFileParams,
  UploadPhotoResult,
} from "@wolgyeham/contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { describeRoute, validator } from "hono-openapi";
import { requireUser } from "../../lib/auth.ts";
import type { AppEnv } from "../../lib/context.ts";
import { AppError, errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as photoService from "./service.ts";

/**
 * 사진 올리기 경로. app.ts의 64KB 본문 한도는 이 경로를 건너뛰고, 라우트가 권한 확인 뒤에 8MB 한도를 겁니다.
 */
export const PHOTO_UPLOAD_PATH = /^\/api\/buildings\/[^/]+\/photos$/;
/** multipart 머리말 여유분. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/** 권한 확인을 마친 올리기 요청과 그 대상(저장소·건물). 요청이 끝나면 함께 사라집니다. */
const uploads = new WeakMap<object, Awaited<ReturnType<typeof photoService.beginUpload>>>();

export const photoRoutes = new Hono<AppEnv>()
  .get(
    "/photos/config",
    describeRoute({
      tags: ["photos"],
      summary: "사진을 올릴 수 있는 환경인지와 한도 (누구나). 저장소가 없으면 uploadsEnabled=false",
      responses: { 200: jsonResponse("사진 설정", PhotoConfig) },
    }),
    (c) => c.json(photoService.getConfig(c.var.photos), 200),
  )
  .post(
    "/buildings/:buildingId/photos",
    describeRoute({
      tags: ["photos"],
      summary:
        "사진 올리기 (집주인, multipart `file` 하나, 8MB 이하 JPEG·PNG·WebP). 서버가 위치 정보를 지우고 1600px WebP로 다시 만듦. 1시간에 60장",
      requestBody: {
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: { file: { type: "string", format: "binary" } },
              required: ["file"],
            },
          },
        },
      },
      responses: {
        201: jsonResponse("저장한 사진 키와 주소", UploadPhotoResult),
        ...errorResponses(400, 401, 403, 404, 413, 429, 503),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    // 본문을 읽기 전에 권한·반복 제한을 봅니다. 그다음에 8MB 본문 한도를 겁니다(app.ts는 이 경로를 건너뜀).
    async (c, next) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      // bodyLimit가 c.req.raw를 바꿀 수 있어 Context로 찾습니다.
      uploads.set(c, await photoService.beginUpload(c.var.db, c.var.photos, user.id, buildingId));
      await next();
    },
    bodyLimit({
      maxSize: PHOTO_UPLOAD_MAX_BYTES + MULTIPART_OVERHEAD_BYTES,
      onError: (c) => c.json({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413),
    }),
    async (c) => {
      const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
      const target = uploads.get(c);
      if (!target) throw new Error("photo upload target missing");
      const result = await photoService.upload(target, form["file"]);
      return c.json(result, 201);
    },
  )
  .get(
    "/photos/buildings/:buildingId/:file",
    describeRoute({
      tags: ["photos"],
      summary:
        "사진 파일 (공개된 안내·보이는 공지의 사진은 누구나, 그 밖은 그 건물 집주인만). 볼 수 없으면 404",
      responses: {
        200: { description: "WebP 이미지 (ETag, no-cache)", content: { "image/webp": {} } },
        304: { description: "If-None-Match가 ETag와 같음" },
        ...errorResponses(404),
      },
    }),
    // 형식이 틀린 경로도 없는 사진처럼 404로 답합니다.
    validator("param", PhotoFileParams, (result) => {
      if (!result.success) throw new AppError(404, "NOT_FOUND");
    }),
    async (c) => {
      const { buildingId, file } = c.req.valid("param");
      const access = await photoService.photoAccess(
        c.var.db,
        c.var.photos,
        c.var.user,
        buildingId,
        file,
      );
      // 키는 내용이 바뀌지 않는 이름이라 강한 ETag로 씁니다. 매번 접근 규칙을 다시 보도록 no-cache로 두고,
      // 같은 사진이면 304로 본문을 다시 보내지 않습니다(공개를 내리면 다음 요청부터 404).
      const headers: Record<string, string> = {
        ETag: `"${access.key.split("/").at(-1)?.replace(".webp", "") ?? ""}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": access.visibility === "public" ? "public, no-cache" : "private, no-cache",
      };
      if (matchesETag(c.req.header("If-None-Match"), headers["ETag"] ?? "")) {
        return c.body(null, 304, headers);
      }
      const photo = await photoService.readPhoto(access.store, access.key);
      headers["Content-Type"] = "image/webp";
      if (photo.size !== undefined) headers["Content-Length"] = String(photo.size);
      return c.body(photo.body, 200, headers);
    },
  );

/** `If-None-Match`(쉼표로 여럿, `*`, 약한 `W/` 포함)에 이 ETag가 있는지. */
function matchesETag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((value) => value.trim().replace(/^W\//, ""))
    .some((value) => value === "*" || value === etag);
}
