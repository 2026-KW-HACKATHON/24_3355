import {
  BuildingParams,
  CreateReportBody,
  CreateReportResult,
  ManagedReport,
  ManagedReportList,
  REPORT_TOKEN_HEADER,
  ReportDetail,
  ReportListQuery,
  ReportLookupBody,
  ReportLookupResult,
  ReportParams,
  ResolveReportBody,
} from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireUser } from "../../lib/auth.ts";
import { reportClientKey } from "../../lib/client.ts";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as reportService from "./service.ts";

export const reportRoutes = new Hono<AppEnv>()
  .post(
    "/buildings/:buildingId/reports",
    describeRoute({
      tags: ["reports"],
      summary:
        "집주인에게 알리기 (누구나, 그 건물 집주인 제외). 비회원이면 조회 토큰을 한 번만 담음. 같은 문구 10분·한 시간 10건 제한",
      responses: {
        201: jsonResponse("보낸 제보와 비회원 조회 토큰", CreateReportResult),
        ...errorResponses(400, 403, 404, 429),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    validator("json", CreateReportBody, onInvalid),
    async (c) => {
      const { buildingId } = c.req.valid("param");
      const result = await reportService.createReport(
        c.var.db,
        c.var.user,
        reportClientKey(c),
        buildingId,
        c.req.valid("json"),
      );
      return c.json(result, 201);
    },
  )
  .get(
    "/buildings/:buildingId/reports",
    describeRoute({
      tags: ["reports"],
      summary:
        "받은 내용 (집주인). 최근에 받은 순, 보낸 사람은 거주자·회원·비회원 구분만. ?status로 거름",
      responses: {
        200: jsonResponse("받은 제보", ManagedReportList),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    validator("query", ReportListQuery, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      const reports = await reportService.listBuildingReports(
        c.var.db,
        user.id,
        buildingId,
        c.req.valid("query"),
      );
      return c.json({ reports }, 200);
    },
  )
  .post(
    "/buildings/:buildingId/reports/lookup",
    describeRoute({
      tags: ["reports"],
      summary:
        "같은 브라우저 재조회 (누구나). 이 건물에 보관한 조회 토큰들의 제보를 같은 순서로, 무효 토큰 자리는 null",
      responses: {
        200: jsonResponse("토큰 순서의 제보", ReportLookupResult),
        ...errorResponses(400, 404),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    validator("json", ReportLookupBody, onInvalid),
    async (c) => {
      const { buildingId } = c.req.valid("param");
      return c.json(
        await reportService.lookupReports(c.var.db, buildingId, c.req.valid("json").tokens),
        200,
      );
    },
  )
  .get(
    "/reports/:reportId",
    describeRoute({
      tags: ["reports"],
      summary:
        "제보 하나 (그 건물 집주인, 보낸 계정, 또는 X-Report-Token의 유효한 토큰). 틀린 토큰은 404, 만료는 410",
      parameters: [
        {
          in: "header",
          name: REPORT_TOKEN_HEADER,
          required: false,
          description: "비회원 조회 토큰. 쿼리로는 받지 않습니다",
          schema: { type: "string" },
        },
      ],
      responses: {
        200: jsonResponse("제보와 보는 사람(보낸 사람·집주인)", ReportDetail),
        ...errorResponses(400, 404, 410),
      },
    }),
    validator("param", ReportParams, onInvalid),
    async (c) => {
      const { reportId } = c.req.valid("param");
      return c.json(
        await reportService.getReport(
          c.var.db,
          c.var.user,
          reportId,
          c.req.header(REPORT_TOKEN_HEADER),
        ),
        200,
      );
    },
  )
  .post(
    "/reports/:reportId/acknowledge",
    describeRoute({
      tags: ["reports"],
      summary: "확인했어요 (집주인). received → acknowledged, 아니면 409",
      responses: {
        200: jsonResponse("확인한 제보", ManagedReport),
        ...errorResponses(400, 401, 403, 404, 409),
      },
    }),
    validator("param", ReportParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { reportId } = c.req.valid("param");
      return c.json(await reportService.acknowledgeReport(c.var.db, user.id, reportId), 200);
    },
  )
  .post(
    "/reports/:reportId/resolve",
    describeRoute({
      tags: ["reports"],
      summary:
        "처리 결과 저장 (집주인). acknowledged → completed | unable, 한 줄(선택). 순서가 맞지 않으면 409",
      responses: {
        200: jsonResponse("결과를 남긴 제보", ManagedReport),
        ...errorResponses(400, 401, 403, 404, 409),
      },
    }),
    validator("param", ReportParams, onInvalid),
    validator("json", ResolveReportBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { reportId } = c.req.valid("param");
      return c.json(
        await reportService.resolveReport(c.var.db, user.id, reportId, c.req.valid("json")),
        200,
      );
    },
  );
