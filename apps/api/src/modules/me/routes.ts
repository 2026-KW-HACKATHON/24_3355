import { Me, MyReportList, MyTipList, TermsConsentBody } from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireUser } from "../../lib/auth.ts";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as authService from "../auth/service.ts";
import * as reportService from "../reports/service.ts";
import * as tipService from "../tips/service.ts";
import * as meService from "./service.ts";

export const meRoutes = new Hono<AppEnv>()
  .get(
    "/me",
    describeRoute({
      tags: ["me"],
      summary: "내 정보, 관리하는 건물, 살아 있는 연결 (로그인 필요)",
      responses: { 200: jsonResponse("로그인한 사용자", Me), ...errorResponses(401) },
    }),
    async (c) => {
      const user = requireUser(c);
      return c.json(await meService.getMe(c.var.db, user.id), 200);
    },
  )
  .post(
    "/me/terms-consent",
    describeRoute({
      tags: ["me"],
      summary:
        "로그인한 채로 지금 약관 판에 동의 (판이 바뀌어 다시 물었을 때). 이미 같은 판이면 처음 시각을 유지. 이전 판이면 409",
      responses: {
        200: jsonResponse("동의를 반영한 내 정보", Me),
        ...errorResponses(400, 401, 409),
      },
    }),
    validator("json", TermsConsentBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      await authService.agreeToTerms(c.var.db, user.id, c.req.valid("json").version);
      return c.json(await meService.getMe(c.var.db, user.id), 200);
    },
  )
  .get(
    "/me/reports",
    describeRoute({
      tags: ["me"],
      summary: "보낸 내용 (로그인 필요). 이 계정으로 보낸 제보만, 최근 순",
      responses: { 200: jsonResponse("보낸 제보", MyReportList), ...errorResponses(401) },
    }),
    async (c) => {
      const user = requireUser(c);
      return c.json({ reports: await reportService.listMyReports(c.var.db, user.id) }, 200);
    },
  )
  .get(
    "/me/tips",
    describeRoute({
      tags: ["me"],
      summary:
        "내가 남긴 팁 (로그인 필요). 가린 팁은 hidden, 지금 그 건물과 연결돼 있을 때만 editable",
      responses: { 200: jsonResponse("내 팁", MyTipList), ...errorResponses(401) },
    }),
    async (c) => {
      const user = requireUser(c);
      return c.json({ tips: await tipService.listMyTips(c.var.db, user.id) }, 200);
    },
  );
