import {
  BuildingParams,
  CorrectionMemoListQuery,
  CorrectionMemoParams,
  CreateCorrectionMemoBody,
  CreateGuideBody,
  Guide,
  GuideCorrectionMemo,
  GuideCorrectionMemoList,
  GuideList,
  GuideParams,
  GuideRevisionResponse,
  KeepCorrectionMemoBody,
  ManagedCorrectionMemo,
  ManagedCorrectionMemoList,
  ManagedGuide,
  PublishGuideBody,
  PublishGuideResult,
  UpdateGuideBody,
} from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireUser } from "../../lib/auth.ts";
import type { AppEnv } from "../../lib/context.ts";
import { errorResponses, jsonResponse, onInvalid } from "../../lib/errors.ts";
import * as guideService from "./service.ts";

export const guideRoutes = new Hono<AppEnv>()
  .get(
    "/buildings/:buildingId/guides",
    describeRoute({
      tags: ["guides"],
      summary: "공개된 기본 안내 목록 (누구나, position 순)",
      responses: { 200: jsonResponse("공개된 안내", GuideList), ...errorResponses(400, 404) },
    }),
    validator("param", BuildingParams, onInvalid),
    async (c) => {
      const { buildingId } = c.req.valid("param");
      return c.json({ guides: await guideService.listPublishedGuides(c.var.db, buildingId) }, 200);
    },
  )
  .get(
    "/guides/:guideId",
    describeRoute({
      tags: ["guides"],
      summary: "기본 안내 하나 (공개된 안내는 누구나, 초안은 그 건물 집주인만). 수정본은 담지 않음",
      responses: { 200: jsonResponse("안내", Guide), ...errorResponses(400, 404) },
    }),
    validator("param", GuideParams, onInvalid),
    async (c) => {
      const { guideId } = c.req.valid("param");
      return c.json(await guideService.getGuide(c.var.db, c.var.user, guideId), 200);
    },
  )
  .post(
    "/buildings/:buildingId/guides",
    describeRoute({
      tags: ["guides"],
      summary: "안내 초안 만들기 (집주인)",
      responses: { 201: jsonResponse("만든 초안", Guide), ...errorResponses(400, 401, 403, 404) },
    }),
    validator("param", BuildingParams, onInvalid),
    validator("json", CreateGuideBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      const guide = await guideService.createDraft(
        c.var.db,
        user.id,
        buildingId,
        c.req.valid("json"),
      );
      return c.json(guide, 201);
    },
  )
  .patch(
    "/guides/:guideId",
    describeRoute({
      tags: ["guides"],
      summary:
        "안내 고치기 (집주인). 초안은 바로 고치고, 공개된 안내는 공개 내용을 두고 수정본(revision)에 저장",
      responses: {
        200: jsonResponse("고친 초안 또는 공개 내용 + 저장한 수정본", ManagedGuide),
        ...errorResponses(400, 401, 403, 404, 409),
      },
    }),
    validator("param", GuideParams, onInvalid),
    validator("json", UpdateGuideBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { guideId } = c.req.valid("param");
      return c.json(
        await guideService.updateGuide(c.var.db, user.id, guideId, c.req.valid("json")),
        200,
      );
    },
  )
  .get(
    "/guides/:guideId/revision",
    describeRoute({
      tags: ["guides"],
      summary: "공개된 안내의 저장한 수정본 (집주인). 없으면 revision=null",
      responses: {
        200: jsonResponse("수정본", GuideRevisionResponse),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", GuideParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { guideId } = c.req.valid("param");
      return c.json(await guideService.getRevision(c.var.db, user.id, guideId), 200);
    },
  )
  .delete(
    "/guides/:guideId/revision",
    describeRoute({
      tags: ["guides"],
      summary: "편집 취소: 수정본만 지움 (집주인). 공개 내용과 메모 상태는 그대로, 없어도 204",
      responses: { 204: { description: "지움" }, ...errorResponses(400, 401, 403, 404) },
    }),
    validator("param", GuideParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { guideId } = c.req.valid("param");
      await guideService.discardRevision(c.var.db, user.id, guideId);
      return c.body(null, 204);
    },
  )
  .post(
    "/guides/:guideId/publish",
    describeRoute({
      tags: ["guides"],
      summary:
        "안내 공개·수정 공개 (집주인). 첫 공개면 건물 open, 공개된 안내는 수정본을 공개 내용으로. applyMemoIds는 같은 트랜잭션에서 applied",
      responses: {
        200: jsonResponse("공개한 안내", PublishGuideResult),
        ...errorResponses(400, 401, 403, 404, 409),
      },
    }),
    validator("param", GuideParams, onInvalid),
    validator("json", PublishGuideBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { guideId } = c.req.valid("param");
      return c.json(
        await guideService.publish(c.var.db, user.id, guideId, c.req.valid("json")),
        200,
      );
    },
  )
  .get(
    "/guides/:guideId/correction-memos",
    describeRoute({
      tags: ["guides"],
      summary:
        "안내의 수정 메모 (이 건물 active·reconfirm_needed 거주자, 집주인). 작성자 없음, 내 메모는 mine=true",
      responses: {
        200: jsonResponse("메모 (최근에 쓴 순)", GuideCorrectionMemoList),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", GuideParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { guideId } = c.req.valid("param");
      return c.json({ memos: await guideService.listGuideMemos(c.var.db, user.id, guideId) }, 200);
    },
  )
  .post(
    "/guides/:guideId/correction-memos",
    describeRoute({
      tags: ["guides"],
      summary: "내용이 달라요: 수정 메모 남기기 (이 건물 active 거주자만)",
      responses: {
        201: jsonResponse("남긴 메모 (pending)", GuideCorrectionMemo),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", GuideParams, onInvalid),
    validator("json", CreateCorrectionMemoBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { guideId } = c.req.valid("param");
      return c.json(
        await guideService.createMemo(c.var.db, user.id, guideId, c.req.valid("json")),
        201,
      );
    },
  )
  .get(
    "/buildings/:buildingId/correction-memos",
    describeRoute({
      tags: ["guides"],
      summary: "건물의 수정 메모 (집주인). pending이 먼저, 작성자 없음. ?status=pending으로 거름",
      responses: {
        200: jsonResponse("메모와 안내 제목", ManagedCorrectionMemoList),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", BuildingParams, onInvalid),
    validator("query", CorrectionMemoListQuery, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { buildingId } = c.req.valid("param");
      const memos = await guideService.listBuildingMemos(
        c.var.db,
        user.id,
        buildingId,
        c.req.valid("query"),
      );
      return c.json({ memos }, 200);
    },
  )
  .get(
    "/correction-memos/:memoId",
    describeRoute({
      tags: ["guides"],
      summary: "수정 메모 하나 (집주인, LF-17 검토)",
      responses: {
        200: jsonResponse("메모와 안내 제목", ManagedCorrectionMemo),
        ...errorResponses(400, 401, 403, 404),
      },
    }),
    validator("param", CorrectionMemoParams, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { memoId } = c.req.valid("param");
      return c.json(await guideService.getMemo(c.var.db, user.id, memoId), 200);
    },
  )
  .post(
    "/correction-memos/:memoId/keep",
    describeRoute({
      tags: ["guides"],
      summary: "기존 안내 유지 (집주인). 사유 필수, pending이 아니면 409",
      responses: {
        200: jsonResponse("유지한 메모", ManagedCorrectionMemo),
        ...errorResponses(400, 401, 403, 404, 409),
      },
    }),
    validator("param", CorrectionMemoParams, onInvalid),
    validator("json", KeepCorrectionMemoBody, onInvalid),
    async (c) => {
      const user = requireUser(c);
      const { memoId } = c.req.valid("param");
      return c.json(
        await guideService.keepMemo(c.var.db, user.id, memoId, c.req.valid("json").reason),
        200,
      );
    },
  );
