type Level = "info" | "warn" | "error";
type Field = string | number | boolean | null | undefined;

/** JSON 한 줄 로그. 이름·카카오 회원번호·토큰·본문·DB 오류 메시지는 넣지 않습니다(backend.md §8). */
export function log(level: Level, event: string, fields: Record<string, Field> = {}) {
  console[level](JSON.stringify({ level, event, time: new Date().toISOString(), ...fields }));
}
