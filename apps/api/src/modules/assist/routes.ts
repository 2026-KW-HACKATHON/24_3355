import {
  AssistConfig,
  BuildingParams,
  GuideSplitBody,
  GuideSplitResult,
} from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireUser } from "../../lib/auth.ts";
import type { AppEnv } from "../../lib/context.ts";
import { AppError, errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as assistService from "./service.ts";

export const assistRoutes = new Hono<AppEnv>()
  .get(
    "/assist/config",
    describeRoute({
      tags: ["assist"],
      summary: "서버에서 켠 집주인 도우미 기능 (누구나). 꺼진 기능은 false이고 웹이 입구를 숨김",
      responses: { 200: jsonResponse("도우미 설정", AssistConfig) },
    }),
    (c) =>
      c.json(
        {
          guideSplit: c.var.ai.generateJson !== null,
          translation: c.var.ai.translate !== null,
        } satisfies AssistConfig,
        200,
      ),
  )
  .post(
    "/buildings/:buildingId/guides/split",
    describeRoute({
      tags: ["assist"],
      summary:
        "카톡 통째로 붙여넣기 (집주인, GEMINI_ENABLED). 글(4000자)을 Vertex AI Gemini로 안내 초안 여러 개로 나눔. 저장하지 않음. 연락처·긴 숫자는 가려 보내고 되돌림. 1시간에 20번",
      responses: {
        200: jsonResponse("나눈 초안 (저장 전)", GuideSplitResult),
        ...errorResponses(400, 401, 403, 404, 429, 502),
      },
    }),
    async (c, next) => {
      // 꺼진 환경에서는 입력·로그인과 상관없이 없는 경로로 답합니다.
      if (!c.var.ai.generateJson) throw new AppError(404, "NOT_FOUND");
      await next();
    },
    validator("param", BuildingParams, onInvalid),
    validator("json", GuideSplitBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      const result = await assistService.splitGuides(
        c.var.db,
        c.var.ai,
        user.id,
        buildingId,
        c.req.valid("json").text,
      );
      return c.json(result, 200);
    },
  );
