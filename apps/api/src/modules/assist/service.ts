import {
  GUIDE_BODY_MAX,
  GUIDE_CATEGORIES,
  GUIDE_SPLIT_BODY_TARGET,
  GUIDE_SPLIT_DRAFTS_MAX,
  GUIDE_TITLE_MAX,
  GuideCategory,
  type GuideSplitDraft,
  type GuideSplitResult,
} from "@wolgyeham/contracts";
import { z } from "zod";
import { requireManager } from "../../lib/auth.ts";
import type { Database } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import type { GoogleAi } from "../../lib/google.ts";
import { log } from "../../lib/log.ts";
import { hitRateLimit } from "../../lib/rate-limit.ts";
import * as buildingService from "../buildings/service.ts";
import { maskSensitive, unmask } from "./mask.ts";

/** 집주인 한 명이 한 시간에 나눌 수 있는 횟수. */
export const GUIDE_SPLIT_LIMIT = { limit: 20, windowSeconds: 60 * 60 };

/** 화면의 종류 이름(웹 features/guides/categories.ts와 같음). 모델이 고르기 쉽게 설명을 붙입니다. */
const CATEGORY_HINTS: Record<GuideCategory, string> = {
  recycling: "분리수거·쓰레기·음식물 배출",
  parcel: "택배·우편·배달",
  facility: "보일러·온수·전기·수도·고장·설비",
  common: "공용공간·현관·주차·복도·소음·생활 규칙",
  contact: "연락처·관리인·문의·긴급 연락",
};

const SYSTEM = [
  "너는 원룸·다세대 건물 집주인이 세입자에게 보내던 카카오톡 안내문을 주제별 안내 카드로 나누는 도우미다.",
  "규칙:",
  "1. 집주인이 쓴 문장을 그대로 옮긴다. 고쳐 쓰거나 요약하거나 존댓말·말투를 바꾸지 않는다. 오타도 그대로 둔다.",
  "2. 글에 없는 사실(요일, 시간, 장소, 번호, 금액)을 지어내지 않는다. 확실하지 않으면 원문 문장을 그대로 둔다.",
  "3. [[P1]], [[E1]], [[N1]], [[C1]] 같은 자리 표시는 가린 연락처·번호다. 글자 하나 바꾸지 말고 원래 자리에 그대로 둔다.",
  "4. 인사말, 서명, 날짜만 있는 줄처럼 안내가 아닌 부분은 뺀다.",
  `5. 주제마다 카드 하나. 최대 ${GUIDE_SPLIT_DRAFTS_MAX}개. 같은 주제는 한 카드로 모은다.`,
  `6. title은 원문에서 그 주제를 가장 잘 나타내는 짧은 구절(${GUIDE_TITLE_MAX}자 이하). 원문에 제목이 있으면 그대로 쓴다.`,
  `7. body는 그 주제에 해당하는 원문 문장들(${GUIDE_SPLIT_BODY_TARGET}자 이하), 줄바꿈 유지.`,
  `8. category는 다음 중 하나: ${GUIDE_CATEGORIES.map((c) => `${c}(${CATEGORY_HINTS[c]})`).join(", ")}.`,
  "9. 안내로 볼 내용이 없으면 drafts를 빈 배열로 둔다.",
].join("\n");

/** Vertex AI responseSchema. 순서를 정해 두면 같은 글에 같은 모양으로 답합니다. */
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    drafts: {
      type: "ARRAY",
      maxItems: GUIDE_SPLIT_DRAFTS_MAX,
      items: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING", enum: [...GUIDE_CATEGORIES] },
          title: { type: "STRING" },
          body: { type: "STRING" },
        },
        required: ["category", "title", "body"],
        propertyOrdering: ["category", "title", "body"],
      },
    },
  },
  required: ["drafts"],
};

/** 모델 응답 검증. 글자 수는 되돌린 뒤 잘라 맞추므로 여기서는 넉넉하게 봅니다. */
const ModelOutput = z.object({
  drafts: z.array(
    z.object({ category: GuideCategory, title: z.string().max(1000), body: z.string().max(8000) }),
  ),
});

function clip(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() : trimmed;
}

/**
 * 카톡 통째로 붙여넣기(D-37). 집주인만, 한 시간 20번. 연락처·긴 숫자를 가려 보낸 뒤 결과에서 되돌리고, 저장은
 * 하지 않습니다(웹이 집주인이 고친 초안을 기존 초안 만들기로 저장, 공개는 미리 보기에서 따로).
 */
export async function splitGuides(
  db: Database,
  ai: GoogleAi,
  userId: string,
  buildingId: string,
  text: string,
): Promise<GuideSplitResult> {
  if (!ai.generateJson) throw new AppError(404, "NOT_FOUND");
  const building = await buildingService.requireBuilding(db, buildingId);
  await requireManager(db, userId, building.id);
  await hitRateLimit(db, "guide_split", userId, GUIDE_SPLIT_LIMIT);

  const masked = maskSensitive(text);
  const raw = await ai.generateJson({
    system: SYSTEM,
    prompt: masked.text,
    schema: RESPONSE_SCHEMA,
    maxOutputTokens: 8192,
  });
  const parsed = ModelOutput.safeParse(raw);
  if (!parsed.success) {
    log("warn", "guide_split_invalid_output", { issues: parsed.error.issues.length });
    throw new AppError(502, "UPSTREAM_FAILED");
  }

  const used = new Set<string>();
  const drafts: GuideSplitDraft[] = [];
  for (const draft of parsed.data.drafts.slice(0, GUIDE_SPLIT_DRAFTS_MAX)) {
    const title = clip(unmask(draft.title, masked.values, used), GUIDE_TITLE_MAX);
    const body = clip(unmask(draft.body, masked.values, used), GUIDE_BODY_MAX);
    if (title && body) drafts.push({ category: draft.category, title, body });
  }
  return {
    drafts,
    maskedCount: masked.values.size,
    unplacedCount: [...masked.values.keys()].filter((key) => !used.has(key)).length,
  };
}
