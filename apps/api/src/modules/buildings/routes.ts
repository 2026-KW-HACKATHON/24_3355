import {
  AcceptManagerInviteResult,
  BuildingParams,
  CurrentJoinCode,
  JoinCode,
  JoinCodeCheckBody,
  JoinCodeCheckResult,
  ManagerInviteBody,
  ManagerInvitePreview,
  PublicBuilding,
} from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireUser } from "../../lib/auth.ts";
import { attemptKeys } from "../../lib/client.ts";
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
  )
  .get(
    "/buildings/:buildingId/join-code",
    describeRoute({
      tags: ["buildings"],
      summary: "현재 가입코드 (집주인, LF-18). 만든 적이 없으면 joinCode=null",
      responses: {
        200: jsonResponse("현재 가입코드", CurrentJoinCode),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      return c.json(await buildingService.getJoinCode(c.var.db, user.id, buildingId), 200);
    },
  )
  .post(
    "/buildings/:buildingId/join-code",
    describeRoute({
      tags: ["buildings"],
      summary: "가입코드 만들기·바꾸기 (집주인). 이전 코드는 끝나고 연결된 거주자는 그대로",
      responses: {
        201: jsonResponse("새 가입코드", JoinCode),
        ...errorResponses(400, 401, 403, 404, 409),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      return c.json(await buildingService.rotateJoinCode(c.var.db, user.id, buildingId), 201);
    },
  )
  .post(
    "/buildings/:buildingId/join-code/check",
    describeRoute({
      tags: ["buildings"],
      summary:
        "가입코드 확인 (로그인 전 1/2). 연결은 만들지 않음. 5회 틀리면 10분 동안 429 JOIN_CODE_LOCKED",
      responses: {
        200: jsonResponse("코드가 맞음", JoinCodeCheckResult),
        ...errorResponses(400, 404, 409, 429),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    validator("json", JoinCodeCheckBody, onInvalid),
    async (c) => {
      const { buildingId } = c.req.valid("param");
      const { code } = c.req.valid("json");
      return c.json(
        await buildingService.checkJoinCode(
          c.var.db,
          buildingId,
          code,
          attemptKeys(c),
          c.var.user !== null,
        ),
        200,
      );
    },
  );
