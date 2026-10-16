import {
  ContentTranslation,
  GuideParams,
  NoticeParams,
  TranslationQuery,
} from "@wolgyeham/contracts";
import { Hono, type MiddlewareHandler } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { ipKey } from "../../lib/client.ts";
import type { AppEnv } from "../../lib/context.ts";
import { AppError, errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as translationService from "./service.ts";

/** 꺼진 환경(TRANSLATION_ENABLED 아님)에서는 입력과 상관없이 없는 경로로 답합니다. */
const requireTranslation: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.ai.translate) throw new AppError(404, "NOT_FOUND");
  await next();
};

export const translationRoutes = new Hono<AppEnv>()
  .get(
    "/guides/:guideId/translation",
    describeRoute({
      tags: ["translations"],
      summary:
        "공개된 안내의 기계 번역 (누구나, TRANSLATION_ENABLED). lang=en|zh-CN|vi. 같은 내용은 한 번만 번역해 저장, 새 번역은 IP당 1시간 60번",
      responses: {
        200: jsonResponse("번역한 제목·본문", ContentTranslation),
        ...errorResponses(400, 404, 429, 502),
      },
    }),
    requireTranslation,
    validator("param", GuideParams, onInvalid),
    validator("query", TranslationQuery, onInvalid),
    async (c) => {
      const { guideId } = c.req.valid("param");
      const { lang } = c.req.valid("query");
      return c.json(
        await translationService.translateGuide(c.var.db, c.var.ai, ipKey(c), guideId, lang),
        200,
      );
    },
  )
  .get(
    "/notices/:noticeId/translation",
    describeRoute({
      tags: ["translations"],
      summary:
        "보이는 공지의 기계 번역 (누구나, TRANSLATION_ENABLED). 끝난 공지는 410. 같은 내용은 한 번만 번역해 저장",
      responses: {
        200: jsonResponse("번역한 제목·본문", ContentTranslation),
        ...errorResponses(400, 404, 410, 429, 502),
      },
    }),
    requireTranslation,
    validator("param", NoticeParams, onInvalid),
    validator("query", TranslationQuery, onInvalid),
    async (c) => {
      const { noticeId } = c.req.valid("param");
      const { lang } = c.req.valid("query");
      return c.json(
        await translationService.translateNotice(c.var.db, c.var.ai, ipKey(c), noticeId, lang),
        200,
      );
    },
  );
