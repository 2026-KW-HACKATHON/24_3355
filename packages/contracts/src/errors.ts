import { z } from "zod";

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_BUILDING_MANAGER",
  "NOT_CONNECTED",
  "RECONFIRM_NEEDED",
  "NOT_FOUND",
  "CONFLICT",
  "JOIN_CODE_INVALID",
  "REPORT_LINK_EXPIRED",
  "NOTICE_ENDED",
  "INVITE_EXPIRED",
  "RATE_LIMITED",
  "JOIN_CODE_LOCKED",
  "REPORT_TOO_FREQUENT",
  "KAKAO_NOT_CONFIGURED",
  "INTERNAL_ERROR",
] as const;
export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** `message`는 개발자용 설명입니다. 화면 문구는 `code`로 고릅니다. */
export const ErrorResponse = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string().optional(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
