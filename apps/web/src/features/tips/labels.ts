import type { TipCategory } from "@wolgyeham/contracts";
import { type AppError, errorMessage } from "../../lib/errors";

// 생활 팁(LF-06·07). 작성자는 누구에게도 보이지 않고, 날짜는 작성 월만 씁니다(screens.md §4).

export const TIP_CATEGORY_LABEL: Readonly<Record<TipCategory, string>> = {
  recycling: "분리수거",
  parcel: "택배",
  winter: "겨울",
  common: "공용공간",
  other: "기타",
};

/** "2026-09" → "2026년 9월". 모양이 다르면 그대로 둡니다. */
export function formatTipMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return `${match[1]}년 ${Number(match[2])}월`;
}

/** 팁 쓰기·고치기·지우기 실패 문구. 쓴 내용은 그대로 둡니다. */
export function tipWriteError(error: AppError, action: "save" | "delete"): string {
  switch (error.code) {
    case "NETWORK":
    case "INTERNAL_ERROR":
      return action === "save"
        ? "남기지 못했어요. 쓴 내용은 그대로 있어요. 다시 눌러 주세요"
        : "지우지 못했어요. 다시 눌러 주세요";
    case "NOT_CONNECTED":
      return action === "save"
        ? "이 건물에 연결된 거주자만 팁을 남길 수 있어요"
        : "이사한 건물의 팁은 고치거나 지울 수 없어요. 지우려면 운영팀에 요청해 주세요";
    case "RECONFIRM_NEEDED":
      return "거주 확인이 필요해서 지금은 팁을 남길 수 없어요";
    case "FORBIDDEN":
      return "집주인 계정으로는 생활 팁을 남길 수 없어요";
    case "NOT_FOUND":
      return "이미 지워졌거나 찾을 수 없는 팁이에요";
    case "CONFLICT":
      return "신고를 확인하는 중이라 지금은 고칠 수 없어요";
    case "VALIDATION_FAILED":
      return "종류와 내용을 확인해 주세요";
    case "UNAUTHENTICATED":
      return action === "save"
        ? "로그인이 끝났어요. 다시 로그인하면 쓰던 팁을 그대로 채워 둘게요"
        : "로그인이 끝났어요. 다시 로그인한 뒤 눌러 주세요";
    default:
      return errorMessage(error);
  }
}
