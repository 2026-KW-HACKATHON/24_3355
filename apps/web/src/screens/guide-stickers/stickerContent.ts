// 안내 스티커(5×5cm)의 내용과 A4 배치. 화면·인쇄·내려받기 PNG가 함께 씁니다.
import type { Guide } from "@wolgyeham/contracts";

/** 스티커 한 장의 크기(mm). */
export const STICKER_MM = 50;
/** A4 한 장에 3칸 × 5줄. 칸 사이 10mm·줄 사이 6mm라 가장자리 여백이 프린터가 못 찍는 곳보다 넓습니다. */
export const STICKER_COLUMNS = 3;
export const STICKER_ROWS = 5;
export const STICKERS_PER_PAGE = STICKER_COLUMNS * STICKER_ROWS;

export const STICKER_HINT = "카메라로 비추면 안내가 열려요";

/** 공개한 안내만, 관리 화면 순서대로. */
export function stickerGuides(guides: readonly Guide[]): Guide[] {
  return guides.filter((guide) => guide.status === "published");
}

/** A4 한 장에 들어갈 만큼씩 나눕니다. 없으면 빈 목록. */
export function stickerPages<T>(items: readonly T[], perPage = STICKERS_PER_PAGE): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += perPage) {
    pages.push(items.slice(index, index + perPage));
  }
  return pages;
}
