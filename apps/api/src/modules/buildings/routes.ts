import {
  AcceptManagerInviteResult,
  BuildingParams,
  ManagerInviteBody,
  ManagerInvitePreview,
  PublicBuilding,
} from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireUser } from "../../lib/auth.ts";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as buildingService from "./service.ts";

export const buildingRoutes = new Hono<AppEnv>()
  .get(
    "/buildings/:buildingId",
    describeRoute({
      tags: ["buildings"],
      summary: "공개 건물 정보 (누구나). preparing 건물도 돌려줌",
      responses: {
        200: jsonResponse("건물 이름과 도로명 주소", PublicBuilding),
        ...errorResponses(400, 404),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    async (c) => {
      const { buildingId } = c.req.valid("param");
      return c.json(await buildingService.getPublicBuilding(c.var.db, buildingId), 200);
    },
  )
  .post(
    "/manager-invites/preview",
    describeRoute({
      tags: ["buildings"],
      summary: "집주인 초대 미리 보기 (로그인 전, LF-41)",
      responses: {
        200: jsonResponse("초대받은 건물 이름", ManagerInvitePreview),
        ...errorResponses(400, 404, 410),
      },
    }),
    validator("json", ManagerInviteBody, onInvalid),
    async (c) => {
      const { token } = c.req.valid("json");
      return c.json(await buildingService.previewInvite(c.var.db, token), 200);
    },
  )
  .post(
    "/manager-invites/accept",
    describeRoute({
      tags: ["buildings"],
      summary: "집주인 초대 수락 (로그인 필요)",
      responses: {
        200: jsonResponse(
          "관리하게 된 건물. 이미 관리자면 alreadyManager=true",
          AcceptManagerInviteResult,
        ),
        ...errorResponses(400, 401, 404, 409, 410),
      },
    }),
    validator("json", ManagerInviteBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { token } = c.req.valid("json");
      return c.json(await buildingService.acceptInvite(c.var.db, user.id, token), 200);
    },
  );
