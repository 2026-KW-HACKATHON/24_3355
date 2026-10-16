import { TERMS_VERSION } from "@wolgyeham/contracts";

/**
 * 지금 판(contracts `TERMS_VERSION`)과 앞 판에서 바뀐 점. 다시 동의 시트가 앞 판에 동의한 분께 짧게 보여줍니다
 * (약관 6조 ‘바뀐 점을 알리며’). 판을 올릴 때 이 목록을 함께 고칩니다. 처음 동의하는 분께는 보여주지 않습니다.
 */
export const TERMS_RELEASE: { readonly version: string; readonly changes: readonly string[] } = {
  version: TERMS_VERSION,
  changes: [
    "집주인이 보내던 카톡 안내를 주제별 초안으로 나누는 기능(Google Vertex AI)과, 안내·공지를 영어·중국어·베트남어로 보는 기계 번역(Google Cloud Translation)을 적었어요. 기능을 켠 환경에서만 Google에 글을 보내요.",
    "나누기 전에 전화번호·이메일·계좌번호는 가려서 보내고, 붙여넣은 글은 저장하지 않아요. 번역한 제목·본문은 같은 번역을 되풀이하지 않으려고 저장해요.",
    "집주인이 새 메모·제보 알림을 켜면 그 사실을 알림 주소와 함께 저장하고, 알림에는 쓴 내용과 보낸 분을 담지 않는다고 적었어요.",
    "시험 환경은 Google Cloud 미국(us-west1)에, 파일럿 서비스는 AWS 서울 리전에 둔다고 나눠 적었어요.",
  ],
};

/** 판(`2026-09-30-draft`)의 앞 날짜를 시행일로 읽습니다. 날짜가 없는 판이면 판 그대로 씁니다. */
export function termsEffectiveDate(version: string = TERMS_VERSION): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(version);
  if (!match) return version;
  const [, year, month, day] = match;
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}
