import {
  BuildingParams,
  CreateNoticeBody,
  CreateNoticeResult,
  CurrentNoticeResponse,
  DeletePushSubscriptionBody,
  Notice,
  NoticeAudience,
  NoticeList,
  NoticeParams,
  PushPublicKey,
  PushSubscriptionBody,
} from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireUser } from "../../lib/auth.ts";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as noticeService from "./service.ts";

export const noticeRoutes = new Hono<AppEnv>()
  .get(
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
  )
  .get(
    "/buildings/:buildingId/notices/audience",
    describeRoute({
      tags: ["notices"],
      summary: "공지 올리기 화면의 연결된 거주자 수와 알림 대상 수 (집주인, LF-15)",
      responses: {
        200: jsonResponse("연결된 거주자 수와 알림을 켠 수", NoticeAudience),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      return c.json(await noticeService.getAudience(c.var.db, user.id, buildingId), 200);
    },
  )
  .get(
    "/buildings/:buildingId/notices",
    describeRoute({
      tags: ["notices"],
      summary: "끝나지 않은 공지 목록 (누구나, 최근에 올린 순)",
      responses: { 200: jsonResponse("공지 목록", NoticeList), ...errorResponses(400, 404) },
    }),
    validator("param", BuildingParams, onInvalid),
    async (c) => {
      const { buildingId } = c.req.valid("param");
      return c.json({ notices: await noticeService.listNotices(c.var.db, buildingId) }, 200);
    },
  )
  .post(
    "/buildings/:buildingId/notices",
    describeRoute({
      tags: ["notices"],
      summary:
        "공지 올리기 (집주인). attemptedCount는 알림 대상 수이고 발송은 응답 뒤에 함 (도착·열람 아님)",
      responses: {
        201: jsonResponse("올린 공지와 발송을 시도한 대상 수", CreateNoticeResult),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    validator("json", CreateNoticeBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      const result = await noticeService.createNotice(
        c.var.db,
        c.var.push,
        c.var.tasks,
        user.id,
        buildingId,
        c.req.valid("json"),
      );
      return c.json(result, 201);
    },
  )
  .get(
    "/notices/:noticeId",
    describeRoute({
      tags: ["notices"],
      summary: "공지 상세 (누구나). 기간이 끝났으면 410 NOTICE_ENDED",
      responses: { 200: jsonResponse("공지", Notice), ...errorResponses(400, 404, 410) },
    }),
    validator("param", NoticeParams, onInvalid),
    async (c) => {
      const { noticeId } = c.req.valid("param");
      return c.json(await noticeService.getNotice(c.var.db, noticeId), 200);
    },
  )
  .post(
    "/notices/:noticeId/opened",
    describeRoute({
      tags: ["notices"],
      summary:
        "공지 열람 기록 (로그인 필요). 이 공지의 알림 대상이었을 때만 처음 한 번 opened_at을 적음. 대상이 아니어도 204",
      responses: {
        204: { description: "기록함 또는 기록할 것 없음" },
        ...errorResponses(400, 401, 404),
      },
    }),
    validator("param", NoticeParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { noticeId } = c.req.valid("param");
      await noticeService.recordOpened(c.var.db, user.id, noticeId);
      return c.body(null, 204);
    },
  )
  .get(
    "/push-subscriptions/public-key",
    describeRoute({
      tags: ["notices"],
      summary: "웹 푸시 구독에 쓰는 VAPID 공개키 (누구나). 푸시를 보낼 수 없는 환경이면 null",
      responses: { 200: jsonResponse("VAPID 공개키", PushPublicKey) },
    }),
    async (c) => c.json(await noticeService.getPushPublicKey(c.var.env, c.var.push), 200),
  )
  .post(
    "/push-subscriptions",
    describeRoute({
      tags: ["notices"],
      summary:
        "이 브라우저의 공지 알림 구독 저장 (active 거주자). 10분에 10번, 사용자마다 최근 5개만 남김",
      responses: {
        204: { description: "저장함. 같은 브라우저면 덮어씀" },
        ...errorResponses(400, 401, 403, 429),
      },
    }),
    validator("json", PushSubscriptionBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      await noticeService.subscribe(c.var.db, user.id, c.req.valid("json"));
      return c.body(null, 204);
    },
  )
  .delete(
    "/push-subscriptions",
    describeRoute({
      tags: ["notices"],
      summary: "이 브라우저의 알림 구독 삭제 (로그인 필요, 없어도 204)",
      responses: { 204: { description: "삭제함" }, ...errorResponses(400, 401) },
    }),
    validator("json", DeletePushSubscriptionBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      await noticeService.unsubscribe(c.var.db, user.id, c.req.valid("json").endpoint);
      return c.body(null, 204);
    },
  );
