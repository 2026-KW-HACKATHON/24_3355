import {
  BuildingParams,
  ConnectBody,
  ConnectResult,
  OccupancyParams,
  OccupancyResult,
} from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireUser } from "../../lib/auth.ts";
import { attemptKeys } from "../../lib/client.ts";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as occupancyService from "./service.ts";

export const occupancyRoutes = new Hono<AppEnv>()
  .post(
    "/buildings/:buildingId/occupancies",
    describeRoute({
      tags: ["occupancies"],
      summary:
        "가입코드로 이 건물과 연결 (로그인 필요, 2/2). 다른 건물과 연결돼 있으면 replaceOccupancyId로 옮김",
      responses: {
        201: jsonResponse("새 연결", ConnectResult),
        200: jsonResponse("이미 이 건물과 연결됨 (alreadyConnected=true)", ConnectResult),
        ...errorResponses(400, 401, 404, 409, 429),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    validator("json", ConnectBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      const { created, ...result } = await occupancyService.connect(
        c.var.db,
        user.id,
        buildingId,
        c.req.valid("json"),
        attemptKeys(c),
        c.var.env.RECONFIRM_INTERVAL_DAYS,
      );
      return c.json(result, created ? 201 : 200);
    },
  )
  .post(
    "/occupancies/:occupancyId/reconfirm",
    describeRoute({
      tags: ["occupancies"],
      summary:
        "아직 살아요 (본인 연결). active로 되돌리고 확인 시각·다음 재확인 요청 시각을 새로 적음. 끝난 연결은 409",
      responses: {
        200: jsonResponse("갱신한 연결", OccupancyResult),
        ...errorResponses(400, 401, 404, 409),
      },
    }),
    validator("param", OccupancyParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { occupancyId } = c.req.valid("param");
      return c.json(
        await occupancyService.reconfirm(
          c.var.db,
          user.id,
          occupancyId,
          c.var.env.RECONFIRM_INTERVAL_DAYS,
        ),
        200,
      );
    },
  )
  .post(
    "/occupancies/:occupancyId/move-out",
    describeRoute({
      tags: ["occupancies"],
      summary:
        "이사했어요 (본인 연결). inactive로 끝내고 이 건물의 멤버 기능·공지 알림이 멈춤. 끝난 연결은 409",
      responses: {
        200: jsonResponse("끝낸 연결", OccupancyResult),
        ...errorResponses(400, 401, 404, 409),
      },
    }),
    validator("param", OccupancyParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { occupancyId } = c.req.valid("param");
      return c.json(await occupancyService.moveOut(c.var.db, user.id, occupancyId), 200);
    },
  );
