// 보낼 글에서 제어문자를 뺍니다(contracts text.ts: 서버는 제어문자가 있으면 400). 탭은 공백으로 바꾸고,
// 여러 줄 글은 줄바꿈(\n)만 남깁니다. 한 줄 글은 줄바꿈도 공백으로 바꿉니다.
const TAB = /\t/g;
const LINE_BREAKS = /\r\n?|\n/g;
const CONTROL_EXCEPT_NEWLINE = /[^\P{Cc}\n]/gu;

export function cleanText(value: string, { multiline }: { multiline: boolean }): string {
  const spaced = value.replace(TAB, " ").replace(/\r\n?/g, "\n");
  const oneLine = multiline ? spaced : spaced.replace(LINE_BREAKS, " ");
  return oneLine.replace(CONTROL_EXCEPT_NEWLINE, "");
}
