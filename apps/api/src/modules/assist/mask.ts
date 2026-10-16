/**
 * Google로 보내기 전에 가리는 값(D-37). 이메일, 전화번호, 계좌번호처럼 숫자가 10개 이상 이어진 값을 `[[P1]]`
 * 같은 자리 표시로 바꾸고, 결과에서 원래 값으로 되돌립니다. 호수·시각·짧은 번호처럼 숫자가 적은 값은 두고,
 * 날짜(예: 2026-10-16)는 숫자가 8개라 남습니다. 현관·도어락 비밀번호처럼 "비번", "현관" 같은 말 바로 뒤에 오는
 * 숫자·`*`·`#` 묶음(4자 이상)도 `[[C1]]`로 가립니다.
 */

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
/** 국내 휴대폰·지역번호·대표번호(15xx-xxxx)와 +82. 구분자는 -, ., 공백, 괄호. */
const PHONE =
  /(?<![\p{N}])(?:\+82[-.\s]?(?:\(0\))?|0)(?:1[016789]|2|[3-6][1-5]|70|50\d?)\)?[-.\s]?\d{3,4}[-.\s]?\d{4}(?![\p{N}])|(?<![\p{N}])1[5-9]\d{2}-\d{4}(?![\p{N}])/gu;
/** 숫자 10개 이상(하이픈·공백 사이에 끼어도 됨): 계좌·카드·주민번호 같은 값. */
const LONG_DIGITS = /(?<![\p{N}])\d(?:[-\s]?\d){9,}(?![\p{N}])/gu;

/** "공동현관 비번은 1234*", "도어락: #5678" 같은 출입 비밀번호. 말과 번호 사이에는 숫자가 아닌 글자 8개까지. */
const DOOR_CODE =
  /(?<=(?:비번|비밀번호|패스워드|도어락|도어록|현관|출입문|번호키)[^\p{N}\n]{0,8})[\d*#](?:[\d*#]|[-\s](?=[\d*#])){2,15}[\d*#]/gu;

const KINDS = [
  { tag: "E", pattern: EMAIL },
  { tag: "P", pattern: PHONE },
  { tag: "N", pattern: LONG_DIGITS },
  { tag: "C", pattern: DOOR_CODE },
] as const;

const PLACEHOLDER = /\[\[([EPNC])(\d{1,3})\]\]/g;

export type Masked = { text: string; values: ReadonlyMap<string, string> };

export function maskSensitive(input: string): Masked {
  const values = new Map<string, string>();
  let text = input;
  for (const { tag, pattern } of KINDS) {
    let count = 0;
    text = text.replace(pattern, (match) => {
      // 같은 값은 같은 자리 표시로 둡니다.
      for (const [key, value] of values)
        if (value === match && key.startsWith(`[[${tag}`)) return key;
      count += 1;
      const key = `[[${tag}${count}]]`;
      values.set(key, match);
      return key;
    });
  }
  return { text, values };
}

/** 자리 표시를 원래 값으로 바꾸고, 쓰인 자리 표시를 `used`에 적습니다. 모르는 자리 표시는 지웁니다. */
export function unmask(
  text: string,
  values: ReadonlyMap<string, string>,
  used: Set<string>,
): string {
  return text.replace(PLACEHOLDER, (key: string) => {
    const value = values.get(key);
    if (value === undefined) return "";
    used.add(key);
    return value;
  });
}
