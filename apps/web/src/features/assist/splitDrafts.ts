import {
  type CreateGuideBody,
  GUIDE_BODY_MAX,
  GUIDE_TITLE_MAX,
  type GuideCategory,
  type GuideSplitResult,
} from "@wolgyeham/contracts";
import { type AppError, errorMessage } from "../../lib/errors";

// 카톡 통째로 붙여넣기(D-37)의 화면 상태. 붙여넣기 → 나눠 보기(서버) → 초안 카드 고치기·빼기 → 초안으로 저장.
// 저장은 카드마다 기존 초안 만들기(`POST /buildings/:id/guides`)로 하고, 공개는 미리 보기에서 따로 합니다.

export type SplitCard = {
  /** 화면 안에서만 쓰는 키. */
  key: string;
  category: GuideCategory;
  title: string;
  body: string;
};

export type SplitState = {
  step: "paste" | "review";
  text: string;
  cards: SplitCard[];
  maskedCount: number;
  unplacedCount: number;
};

export const INITIAL_SPLIT: SplitState = {
  step: "paste",
  text: "",
  cards: [],
  maskedCount: 0,
  unplacedCount: 0,
};

export type SplitAction =
  | { type: "text"; text: string }
  | { type: "result"; result: GuideSplitResult }
  | { type: "edit"; key: string; patch: Partial<Omit<SplitCard, "key">> }
  | { type: "remove"; key: string }
  /** 저장한 카드는 목록에서 뺍니다(일부만 저장하고 실패했을 때 다시 눌러도 겹쳐 만들지 않게). */
  | { type: "saved"; key: string }
  | { type: "back" };

let nextKey = 0;

export function splitReducer(state: SplitState, action: SplitAction): SplitState {
  switch (action.type) {
    case "text":
      return { ...state, text: action.text };
    case "result":
      return {
        ...state,
        step: "review",
        cards: action.result.drafts.map((draft) => {
          nextKey += 1;
          return { key: `split-${nextKey}`, ...draft };
        }),
        maskedCount: action.result.maskedCount,
        unplacedCount: action.result.unplacedCount,
      };
    case "edit":
      return {
        ...state,
        cards: state.cards.map((card) =>
          card.key === action.key ? { ...card, ...action.patch } : card,
        ),
      };
    case "remove":
    case "saved":
      return { ...state, cards: state.cards.filter((card) => card.key !== action.key) };
    case "back":
      // 붙여넣은 글은 그대로 두고 다시 나눌 수 있게 합니다.
      return { ...state, step: "paste", cards: [], maskedCount: 0, unplacedCount: 0 };
  }
}

export type CardErrors = Partial<Record<"title" | "body", string>>;

export function validateCard(card: SplitCard): CardErrors {
  const errors: CardErrors = {};
  const title = card.title.trim();
  const body = card.body.trim();
  if (!title) errors.title = "제목을 적어 주세요";
  else if (title.length > GUIDE_TITLE_MAX)
    errors.title = `제목은 ${GUIDE_TITLE_MAX}자까지 쓸 수 있어요`;
  if (!body) errors.body = "내용을 적어 주세요";
  else if (body.length > GUIDE_BODY_MAX)
    errors.body = `내용은 ${GUIDE_BODY_MAX}자까지 쓸 수 있어요`;
  return errors;
}

export function toCreateBody(card: SplitCard): CreateGuideBody {
  return { category: card.category, title: card.title.trim(), body: card.body.trim(), photos: [] };
}

/** 나누기 요청이 실패했을 때의 문구. */
export function splitErrorMessage(error: AppError): string {
  if (error.code === "UPSTREAM_FAILED" || error.code === "NETWORK") {
    return "지금은 나누지 못했어요. 잠시 뒤 다시 누르거나, 직접 나눠 써 주세요";
  }
  if (error.code === "RATE_LIMITED") {
    return "한 시간에 20번까지 나눌 수 있어요. 잠시 뒤 다시 시도해 주세요";
  }
  if (error.code === "NOT_FOUND") return "지금은 이 기능을 쓸 수 없어요. 직접 나눠 써 주세요";
  if (error.code === "VALIDATION_FAILED") return "붙여넣은 글을 확인해 주세요";
  return errorMessage(error);
}
