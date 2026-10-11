// 현관 안내문(화면·인쇄·내려받기 PNG)이 함께 쓰는 내용. 배치 숫자는 팀 현관 포스터(1240×1754px) 기준입니다.
import type { ManagedBuildingDetail } from "@wolgyeham/contracts";
import { CATEGORY_ORDER, joinCategoryLabels } from "../../features/guides/categories";

export const SIGN_TITLE = ["이 건물의 안내,", "여기서 확인하세요."] as const;
export const SIGN_SCAN = "카메라로 QR을 비추면 가입 없이 안내가 열려요";

/** “서울 노원구 광운로 20” → 위 작은 줄 “서울 노원구”, 큰 줄 “광운로 20”. 구 이름을 못 찾으면 주소 전체를 큰 줄에 둡니다. */
export function splitAddress(fullAddress: string): { district: string; road: string } {
  const words = fullAddress.trim().split(/\s+/);
  const gu = words.findIndex((word) => /(구|군|시)$/.test(word) && word !== words[0]);
  if (gu === -1 || gu === words.length - 1) return { district: "", road: fullAddress.trim() };
  return { district: words.slice(0, gu + 1).join(" "), road: words.slice(gu + 1).join(" ") };
}

/** 공개된 안내 종류만 정해진 순서로(“분리수거 · 택배”). 없으면 빈 문자열. */
export function signTopics(guides: ManagedBuildingDetail["guides"]): string {
  const used = new Set(guides.filter((g) => g.status === "published").map((g) => g.category));
  return joinCategoryLabels(CATEGORY_ORDER.filter((category) => used.has(category)));
}
