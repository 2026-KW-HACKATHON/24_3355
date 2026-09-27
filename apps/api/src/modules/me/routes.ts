import { Me } from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { requireUser } from "../../lib/auth.ts";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse } from "../../lib/errors.ts";
import * as meService from "./service.ts";

export const meRoutes = new Hono<AppEnv>().get(
  "/me",
  describeRoute({
    tags: ["me"],
    summary: "내 정보와 관리하는 건물 (로그인 필요)",
    responses: { 200: jsonResponse("로그인한 사용자", Me), ...errorResponses(401) },
  }),
  async (c) => {
    const user = requireUser(c);
    return c.json(await meService.getMe(c.var.db, user.id), 200);
  },
);
