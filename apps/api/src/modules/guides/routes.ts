import {
  BuildingParams,
  CreateGuideBody,
  Guide,
  GuideList,
  GuideParams,
  PublishGuideResult,
  UpdateGuideBody,
} from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireUser } from "../../lib/auth.ts";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as guideService from "./service.ts";

export const guideRoutes = new Hono<AppEnv>()
  .get(
    "/buildings/:buildingId/guides",
    describeRoute({
      tags: ["guides"],
      summary: "공개된 기본 안내 목록 (누구나, position 순)",
      responses: { 200: jsonResponse("공개된 안내", GuideList), ...errorResponses(400, 404) },
    }),
    validator("param", BuildingParams, onInvalid),
    async (c) => {
      const { buildingId } = c.req.valid("param");
      return c.json({ guides: await guideService.listPublishedGuides(c.var.db, buildingId) }, 200);
    },
  )
  .get(
    "/guides/:guideId",
    describeRoute({
      tags: ["guides"],
      summary: "기본 안내 하나 (공개된 안내는 누구나, 초안은 그 건물 집주인만)",
      responses: { 200: jsonResponse("안내", Guide), ...errorResponses(400, 404) },
    }),
    validator("param", GuideParams, onInvalid),
    async (c) => {
      const { guideId } = c.req.valid("param");
      return c.json(await guideService.getGuide(c.var.db, c.var.user, guideId), 200);
    },
  )
  .post(
    "/buildings/:buildingId/guides",
    describeRoute({
      tags: ["guides"],
      summary: "안내 초안 만들기 (집주인)",
      responses: { 201: jsonResponse("만든 초안", Guide), ...errorResponses(400, 401, 403, 404) },
    }),
    validator("param", BuildingParams, onInvalid),
    validator("json", CreateGuideBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      const guide = await guideService.createDraft(
        c.var.db,
        user.id,
        buildingId,
        c.req.valid("json"),
      );
      return c.json(guide, 201);
    },
  )
  .patch(
    "/guides/:guideId",
    describeRoute({
      tags: ["guides"],
      summary: "안내 초안 고치기 (집주인). 공개된 안내는 409",
      responses: {
        200: jsonResponse("고친 초안", Guide),
        ...errorResponses(400, 401, 403, 404, 409),
      },
    }),
    validator("param", GuideParams, onInvalid),
    validator("json", UpdateGuideBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { guideId } = c.req.valid("param");
      return c.json(
        await guideService.updateDraft(c.var.db, user.id, guideId, c.req.valid("json")),
        200,
      );
    },
  )
  .post(
    "/guides/:guideId/publish",
    describeRoute({
      tags: ["guides"],
      summary: "안내 공개 (집주인). 첫 공개면 건물이 open이 됨",
      responses: {
        200: jsonResponse("공개한 안내", PublishGuideResult),
        ...errorResponses(400, 401, 403, 404, 409),
      },
    }),
    validator("param", GuideParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { guideId } = c.req.valid("param");
      return c.json(await guideService.publish(c.var.db, user.id, guideId), 200);
    },
  );
