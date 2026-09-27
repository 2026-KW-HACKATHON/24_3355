import { BuildingParams, CurrentNoticeResponse } from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as noticeService from "./service.ts";

export const noticeRoutes = new Hono<AppEnv>().get(
  "/buildings/:buildingId/notices/current",
  describeRoute({
    tags: ["notices"],
    summary: "끝나지 않은 공지 중 가장 최근 것 (누구나)",
    responses: {
      200: jsonResponse("현재 공지. 없으면 notice=null", CurrentNoticeResponse),
      ...errorResponses(400, 404),
    },
  }),
  validator("param", BuildingParams, onInvalid),
  async (c) => {
    const { buildingId } = c.req.valid("param");
    return c.json(await noticeService.getCurrentNotice(c.var.db, buildingId), 200);
  },
);
