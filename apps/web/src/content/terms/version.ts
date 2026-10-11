import { TERMS_VERSION } from "@wolgyeham/contracts";

/**
 * 지금 판(contracts `TERMS_VERSION`)과 앞 판에서 바뀐 점. 다시 동의 시트가 앞 판에 동의한 분께 짧게 보여줍니다
 * (약관 6조 ‘바뀐 점을 알리며’). 판을 올릴 때 이 목록을 함께 고칩니다. 처음 동의하는 분께는 보여주지 않습니다.
 */
export const TERMS_RELEASE: { readonly version: string; readonly changes: readonly string[] } = {
  version: TERMS_VERSION,
  changes: [
    "집주인이 안내와 공지에 붙이는 사진을 저장하는 것으로 적었어요. 사진 속 위치·기기 정보는 지우고 저장해요.",
    "공개한 안내와 기간 중인 공지의 사진은 건물 화면을 여는 누구나 볼 수 있고, 공개 전 사진은 집주인만 봐요.",
    "사진을 지우는 때와, 사진 파일을 AWS 서울 리전(S3)에 둔다는 것을 적었어요.",
  ],
};

/** 판(`2026-09-30-draft`)의 앞 날짜를 시행일로 읽습니다. 날짜가 없는 판이면 판 그대로 씁니다. */
export function termsEffectiveDate(version: string = TERMS_VERSION): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(version);
  if (!match) return version;
  const [, year, month, day] = match;
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}
