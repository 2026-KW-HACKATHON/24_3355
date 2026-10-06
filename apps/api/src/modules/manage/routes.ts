import {
  BuildingParams,
  ConfirmManagedBuildingBody,
  ManagedBuilding,
  ManagedBuildingDetail,
  ManagedBuildingList,
  UpdateManagedBuildingBody,
} from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireUser } from "../../lib/auth.ts";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as buildingService from "../buildings/service.ts";
import * as manageService from "./service.ts";

export const manageRoutes = new Hono<AppEnv>()
  .get(
    "/manage/buildings",
    describeRoute({
      tags: ["manage"],
      summary: "내가 관리하는 건물과 안내 개수 (집주인)",
      responses: {
        200: jsonResponse("관리하는 건물. 없으면 빈 목록", ManagedBuildingList),
        ...errorResponses(401),
      },
    }),
    async (c) => {
      const user = requireUser(c);
      return c.json(
        { buildings: await manageService.listManagedBuildings(c.var.db, user.id) },
        200,
      );
    },
  )
  .get(
    "/manage/buildings/:buildingId",
    describeRoute({
      tags: ["manage"],
      summary: "관리 화면의 건물과 모든 안내 (초안 포함, 집주인)",
      responses: {
        200: jsonResponse("건물(팀 확인 주소 포함)과 안내", ManagedBuildingDetail),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      return c.json(
        await manageService.getManagedBuildingDetail(c.var.db, user.id, buildingId),
        200,
      );
    },
  )
  .patch(
    "/manage/buildings/:buildingId",
    describeRoute({
      tags: ["manage"],
      summary: "건물 이름 고치기 (집주인). 주소는 팀이 확인한 값이라 바꾸지 않음",
      responses: {
        200: jsonResponse("고친 건물", ManagedBuilding),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    validator("json", UpdateManagedBuildingBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      const { name } = c.req.valid("json");
      return c.json(await buildingService.renameBuilding(c.var.db, user.id, buildingId, name), 200);
    },
  )
  .post(
    "/manage/buildings/:buildingId/confirm",
    describeRoute({
      tags: ["manage"],
      summary:
        "건물 확인 (집주인, LF-12·23 ‘맞아요’). 처음 확인한 시각을 남기고, 이름을 보내면 함께 고침. 다시 불러도 성공",
      responses: {
        200: jsonResponse("확인한 건물(confirmedAt)", ManagedBuilding),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    validator("json", ConfirmManagedBuildingBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      const { name } = c.req.valid("json");
      return c.json(
        await buildingService.confirmBuilding(c.var.db, user.id, buildingId, name),
        200,
      );
    },
  );
