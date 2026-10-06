import { JOIN_CODE_LENGTH, JoinCodeInput, normalizeJoinCode } from "@wolgyeham/contracts";

// 가입코드 입력(lofi 02). 6자리 영숫자이고, 받은 문장을 통째로 붙여넣어도 코드만 골라 넣습니다.

/** 입력칸에 보여줄 값: 대문자 영숫자만, 6자리까지. */
export function sanitizeJoinCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, JOIN_CODE_LENGTH);
}

// 서버가 만드는 코드는 헷갈리는 글자(0·O·1·I·L)를 쓰지 않습니다(apps/api buildings/service.ts의 31자).
// 문장 속에서는 이 글자로만 된 `WK72P4`, `WK7-2P4`, `wk7 2p4`를 앞뒤가 영숫자가 아닌 곳에서 찾습니다.
const CODE_CHAR = "[2-9A-HJKMNP-Za-hjkmnp-z]";
const CODE_IN_TEXT = new RegExp(
  `(?<![A-Za-z0-9])${CODE_CHAR}{3}[\\s-]?${CODE_CHAR}{3}(?![A-Za-z0-9])`,
  "g",
);
/** 코드 앞에 흔히 붙는 말. 여러 후보가 있으면 이 말 바로 뒤(없으면 바로 앞)의 것을 고릅니다. */
const CODE_LABEL = /가입\s*코드|코드|code/i;
const CODE_ONLY_TEXT = /^[A-Za-z0-9\s-]*$/;

function pickCandidate(pasted: string, candidates: RegExpExecArray[]): RegExpExecArray | undefined {
  const label = CODE_LABEL.exec(pasted);
  if (label) {
    const end = label.index + label[0].length;
    const after = candidates.find((candidate) => candidate.index >= end);
    if (after) return after;
    return candidates.filter((candidate) => candidate.index < label.index).at(-1);
  }
  // 이름표가 없으면 글자와 숫자가 섞인 것(실제 코드일 가능성이 큼)을 먼저 봅니다.
  return (
    candidates.find((candidate) => /\d/.test(candidate[0]) && /[A-Za-z]/.test(candidate[0])) ??
    candidates[0]
  );
}

/**
 * 붙여넣은 글에서 코드를 찾습니다. “가입코드: WK7-2P4” 같은 문장도 받습니다. 문장에 코드로 쓸 수 있는
 * 후보가 없으면(예: “ABC 123 하우스”) 빈 값을 돌려줘 엉뚱한 글자를 채우지 않습니다.
 */
export function extractJoinCode(pasted: string): string {
  const whole = JoinCodeInput.safeParse(pasted);
  if (whole.success) return normalizeJoinCode(whole.data);
  const picked = pickCandidate(pasted, [...pasted.matchAll(CODE_IN_TEXT)]);
  if (picked) return normalizeJoinCode(picked[0]);
  // 코드 조각만 나눠 붙여넣은 경우(예: “72”)는 이어 붙이고, 다른 글이 섞였으면 넣지 않습니다.
  return CODE_ONLY_TEXT.test(pasted) ? sanitizeJoinCode(pasted) : "";
}

/** 붙여넣은 값이 코드 한 벌이면 지금 값을 바꾸고, 아니면 뒤에 이어 붙입니다. */
export function mergePastedJoinCode(current: string, pasted: string): string {
  const code = extractJoinCode(pasted);
  if (code.length === JOIN_CODE_LENGTH) return code;
  return sanitizeJoinCode(current + code);
}

export function isCompleteJoinCode(value: string): boolean {
  return value.length === JOIN_CODE_LENGTH && /^[A-Z0-9]+$/.test(value);
}

/** 잠금 대기(Retry-After 초)를 화면 문구의 분 단위로. 1분 미만도 1분으로 올립니다. */
export function lockMinutesLeft(untilMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((untilMs - nowMs) / 60_000));
}
