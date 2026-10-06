import { GUIDE_CATEGORIES, type Guide, type GuideCategory } from "@wolgyeham/contracts";
import type { IconName } from "../../components/Icon";

// 안내 종류의 화면 문구와 아이콘(lofi 01·33). 값 목록은 contracts의 GUIDE_CATEGORIES가 기준입니다.
export const CATEGORY: Readonly<Record<GuideCategory, { label: string; icon: IconName }>> = {
  recycling: { label: "분리수거", icon: "recycle" },
  parcel: { label: "택배", icon: "package" },
  facility: { label: "보일러·설비", icon: "flame" },
  common: { label: "공용공간", icon: "door-open" },
  contact: { label: "연락", icon: "phone" },
};

export const CATEGORY_ORDER = GUIDE_CATEGORIES;

/** 같은 종류 안내가 둘 이상이면 타일 이름을 제목으로 바꿔 구분합니다. */
export function tileLabels(guides: readonly Guide[]): Map<string, string> {
  const counts = new Map<GuideCategory, number>();
  for (const guide of guides) counts.set(guide.category, (counts.get(guide.category) ?? 0) + 1);
  return new Map(
    guides.map((guide) => [
      guide.id,
      (counts.get(guide.category) ?? 0) > 1 ? guide.title : CATEGORY[guide.category].label,
    ]),
  );
}

/** 같은 종류 안내가 둘 이상인지. 그러면 타일 이름(종류·두 줄 제목)만으로 구분되지 않아 제목 목록으로 보여줍니다. */
export function hasSameCategory(guides: readonly Guide[]): boolean {
  return new Set(guides.map((guide) => guide.category)).size < guides.length;
}

/** 아직 공개 안내가 없는 종류(“택배·보일러·설비 안내는 …”). 연락은 선택 항목이라 뺍니다. */
export function missingCategories(guides: readonly Guide[]): GuideCategory[] {
  const used = new Set(guides.map((guide) => guide.category));
  return CATEGORY_ORDER.filter((category) => category !== "contact" && !used.has(category));
}

export function joinCategoryLabels(categories: readonly GuideCategory[]): string {
  return categories.map((category) => CATEGORY[category].label).join(" · ");
}
