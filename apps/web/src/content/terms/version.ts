import { TERMS_VERSION } from "@wolgyeham/contracts";

/**
 * 지금 판(contracts `TERMS_VERSION`)과 앞 판에서 바뀐 점. 다시 동의 시트가 앞 판에 동의한 분께 짧게 보여줍니다
 * (약관 6조 ‘바뀐 점을 알리며’). 판을 올릴 때 이 목록을 함께 고칩니다. 처음 동의하는 분께는 보여주지 않습니다.
 */
export const TERMS_RELEASE: { readonly version: string; readonly changes: readonly string[] } = {
  version: TERMS_VERSION,
  changes: [
    "CloudFront에서 서버까지 HTTPS 전환을 완료해 보호 조치에 반영했어요.",
    "모든 로그인 화면에서 로그인 전에 필수 동의를 받아요.",
    "카카오에는 회원번호만 요청하고, 이 기기에만 저장하는 것과 지우는 방법을 자세히 적었어요.",
    "알림을 전하는 푸시 서비스와, 파일럿 동안 알린 내용을 집주인에게 전하는 카카오톡을 맡기는 곳에 적었어요.",
    "이용을 막는 기능은 아직 없다는 것과 지금 실제로 걸려 있는 제한만 적었어요.",
  ],
};

/** 판(`2026-09-30-draft`)의 앞 날짜를 시행일로 읽습니다. 날짜가 없는 판이면 판 그대로 씁니다. */
export function termsEffectiveDate(version: string = TERMS_VERSION): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(version);
  if (!match) return version;
  const [, year, month, day] = match;
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}
