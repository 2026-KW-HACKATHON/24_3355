import { type ErrorCode, ErrorResponse } from "@wolgyeham/contracts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { resolver } from "hono-openapi";

/** 서비스가 던지는 예상된 오류. app.onError가 `{ error: { code, fields? } }`로 바꿉니다. */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;
  readonly fields: Record<string, string> | undefined;

  constructor(status: ContentfulStatusCode, code: ErrorCode, fields?: Record<string, string>) {
    super(code);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type Issue = {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
};

/** validator 훅. 실패하면 필드 경로별 사유를 모아 400 VALIDATION_FAILED를 던집니다. */
export function onInvalid(result: { success: true } | { success: false; error: readonly Issue[] }) {
  if (result.success) return;
  const fields: Record<string, string> = {};
  for (const issue of result.error) {
    const path = (issue.path ?? [])
      .map((segment) => String(typeof segment === "object" ? segment.key : segment))
      .join(".");
    fields[path] ??= issue.message;
  }
  throw new AppError(400, "VALIDATION_FAILED", fields);
}

const DESCRIPTIONS: Record<number, string> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN, NOT_BUILDING_MANAGER",
  404: "NOT_FOUND",
  409: "CONFLICT",
  410: "INVITE_EXPIRED",
  503: "KAKAO_NOT_CONFIGURED",
};

/** describeRoute의 responses에 펼쳐 넣는 오류 응답 문서. */
export function errorResponses(...statuses: number[]) {
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      {
        description: DESCRIPTIONS[status] ?? "Error",
        content: { "application/json": { schema: resolver(ErrorResponse) } },
      },
    ]),
  );
}

/** describeRoute의 성공 응답 문서. */
export function jsonResponse(description: string, schema: Parameters<typeof resolver>[0]) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
