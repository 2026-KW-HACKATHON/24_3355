/**
 * 사람이 쓰는 글의 제어문자 검사. 운영 도구·로그·터미널에 그대로 찍혀도 화면을 흐트러뜨리지 않도록
 * 제어문자(U+0000–U+001F, U+007F–U+009F)를 받지 않습니다. 여러 줄 글은 줄바꿈(`\n`)만 허용합니다.
 */
export const SINGLE_LINE_TEXT = /^\P{Cc}*$/u;
export const MULTILINE_TEXT = /^(?:\P{Cc}|\n)*$/u;
export const CONTROL_CHARACTER_MESSAGE = "control characters are not allowed";
