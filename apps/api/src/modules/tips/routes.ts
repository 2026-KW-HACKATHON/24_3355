import {
  BuildingParams,
  ContentReportResult,
  CreateContentReportBody,
  CreateTipBody,
  Tip,
  TipList,
  TipParams,
  UpdateTipBody,
} from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireUser } from "../../lib/auth.ts";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as tipService from "./service.ts";

export const tipRoutes = new Hono<AppEnv>()
  .get(
    "/buildings/:buildingId/tips",
    describeRoute({
      tags: ["tips"],
      summary:
        "거주자가 남긴 팁 (이 건물 active·reconfirm_needed 거주자, 집주인). 작성자 없음·작성 월만, 내 팁은 mine=true",
      responses: {
        200: jsonResponse("보이는 팁 (최근에 쓴 순)", TipList),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      return c.json(
        { tips: await tipService.listBuildingTips(c.var.db, user.id, buildingId) },
        200,
      );
    },
  )
  .post(
    "/buildings/:buildingId/tips",
    describeRoute({
      tags: ["tips"],
      summary: "생활 팁 남기기 (이 건물 active 거주자만)",
      responses: {
        201: jsonResponse("남긴 팁", Tip),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    validator("json", CreateTipBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      return c.json(
        await tipService.createTip(c.var.db, user.id, buildingId, c.req.valid("json")),
        201,
      );
    },
  )
  .patch(
    "/tips/:tipId",
    describeRoute({
      tags: ["tips"],
      summary: "본인 팁 고치기 (그 건물과 연결된 작성자). 남의 팁은 404, 이사한 뒤에는 403",
      responses: {
        200: jsonResponse("고친 팁", Tip),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", TipParams, onInvalid),
    validator("json", UpdateTipBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { tipId } = c.req.valid("param");
      return c.json(await tipService.updateTip(c.var.db, user.id, tipId, c.req.valid("json")), 200);
    },
  )
  .delete(
    "/tips/:tipId",
    describeRoute({
      tags: ["tips"],
      summary: "본인 팁 지우기 (그 건물과 연결된 작성자). 남의 팁은 404, 이사한 뒤에는 403",
      responses: { 204: { description: "지움" }, ...errorResponses(400, 401, 403, 404) },
    }),
    validator("param", TipParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { tipId } = c.req.valid("param");
      await tipService.deleteTip(c.var.db, user.id, tipId);
      return c.body(null, 204);
    },
  )
  .post(
    "/tips/:tipId/content-reports",
    describeRoute({
      tags: ["tips"],
      summary:
        "팁 신고 (이 건물 active·reconfirm_needed 거주자, 집주인). 한 사람이 한 번, 다시 하면 200 alreadyReported",
      responses: {
        201: jsonResponse("신고함", ContentReportResult),
        200: jsonResponse("이미 신고한 팁", ContentReportResult),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", TipParams, onInvalid),
    validator("json", CreateContentReportBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { tipId } = c.req.valid("param");
      const result = await tipService.reportTip(c.var.db, user.id, tipId, c.req.valid("json"));
      return c.json(result, result.alreadyReported ? 200 : 201);
    },
  );
