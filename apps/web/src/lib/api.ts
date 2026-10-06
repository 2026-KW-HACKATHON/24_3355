import ky, { type StandardSchemaV1, type StandardSchemaV1InferOutput } from "ky";
import { toAppError } from "./errors";

/** 같은 출처의 `/api`만 부릅니다. 재시도는 react-query 한 곳에서만 합니다(frontend.md §2). */
export const http = ky.create({ timeout: 10_000, retry: 0, credentials: "same-origin" });

type Output<S extends StandardSchemaV1> = StandardSchemaV1InferOutput<S>;

async function run<S extends StandardSchemaV1>(
  send: () => ReturnType<typeof http.get>,
  schema: S,
): Promise<Output<S>> {
  try {
    return await send().json(schema);
  } catch (error) {
    throw toAppError(error);
  }
}

/** 응답은 contracts의 zod 스키마로 검증합니다. 다르면 INTERNAL_ERROR로 다룹니다. */
export function getJson<S extends StandardSchemaV1>(path: string, schema: S) {
  return run(() => http.get(path), schema);
}

export function postJson<S extends StandardSchemaV1>(path: string, body: unknown, schema: S) {
  return run(() => http.post(path, { json: body }), schema);
}

export function patchJson<S extends StandardSchemaV1>(path: string, body: unknown, schema: S) {
  return run(() => http.patch(path, { json: body }), schema);
}

/** 응답 본문이 없는 요청(204). */
export async function postEmpty(path: string): Promise<void> {
  try {
    await http.post(path);
  } catch (error) {
    throw toAppError(error);
  }
}

/** 본문도 응답 본문도 없는 삭제(204). 안내 수정본 지우기에 씁니다. */
export async function deleteEmpty(path: string): Promise<void> {
  try {
    await http.delete(path);
  } catch (error) {
    throw toAppError(error);
  }
}

/** 본문을 보내고 응답 본문은 없는 요청(204). 푸시 구독 저장·삭제에 씁니다. */
export async function sendJsonEmpty(
  method: "post" | "delete",
  path: string,
  body: unknown,
): Promise<void> {
  try {
    await http(path, { method, json: body });
  } catch (error) {
    throw toAppError(error);
  }
}

/** URL 조각에 들어갈 id를 안전하게 넣습니다. */
export function seg(value: string): string {
  return encodeURIComponent(value);
}
