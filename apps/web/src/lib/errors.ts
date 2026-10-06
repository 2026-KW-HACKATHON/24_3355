import { type ErrorCode, ErrorResponse } from "@wolgyeham/contracts";
import { isHTTPError, isNetworkError, isTimeoutError } from "ky";

export type AppErrorCode = ErrorCode | "NETWORK";

/** API 호출 실패를 한 모양으로 모읍니다. 화면은 HTTP 상태가 아니라 `code`로 분기합니다. */
export class AppError extends Error {
  override readonly name = "AppError";
  readonly code: AppErrorCode;
  readonly fields: Readonly<Record<string, string>>;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    code: AppErrorCode,
    options: { fields?: Record<string, string>; retryAfterSeconds?: number } = {},
  ) {
    super(code);
    this.code = code;
    this.fields = options.fields ?? {};
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

function retryAfter(headers: Headers): number | undefined {
  const raw = headers.get("Retry-After");
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isNetworkError(error) || isTimeoutError(error)) return new AppError("NETWORK");
  if (isHTTPError(error)) {
    const parsed = ErrorResponse.safeParse(error.data);
    const seconds = retryAfter(error.response.headers);
    if (!parsed.success) return new AppError("INTERNAL_ERROR");
    const { code, fields } = parsed.data.error;
    return new AppError(code, {
      ...(fields ? { fields } : {}),
      ...(seconds === undefined ? {} : { retryAfterSeconds: seconds }),
    });
  }
  // fetch 자체가 실패한 TypeError(오프라인 등)
  if (error instanceof TypeError) return new AppError("NETWORK");
  // 응답이 계약과 다름(SchemaValidationError) 또는 예상하지 못한 오류
  return new AppError("INTERNAL_ERROR");
}

/** 다시 시도해서 나아질 수 있는 오류만 자동 재시도합니다. */
export function isRetryable(error: unknown): boolean {
  const { code } = toAppError(error);
  return code === "NETWORK" || code === "INTERNAL_ERROR";
}

/** 오류 코드 → 화면 문구. lofi·README에 없는 문구는 초안입니다(frontend.md §6). */
const messages: Readonly<Record<AppErrorCode, string>> = {
  NETWORK: "연결이 불안정해요. 잠시 뒤 다시 시도해 주세요",
  INTERNAL_ERROR: "잠시 문제가 생겼어요. 다시 시도해 주세요",
  VALIDATION_FAILED: "입력한 내용을 확인해 주세요",
  UNAUTHENTICATED: "로그인이 필요해요",
  FORBIDDEN: "이 작업을 할 수 있는 권한이 없어요",
  NOT_BUILDING_MANAGER: "이 건물을 관리할 권한이 없어요",
  NOT_CONNECTED: "이 건물에 연결한 뒤 쓸 수 있어요",
  RECONFIRM_NEEDED: "이 건물에 아직 사는지 확인이 필요해요",
  NOT_FOUND: "찾을 수 없어요",
  CONFLICT: "이미 상태가 바뀌었어요. 새로 불러온 뒤 다시 해 주세요",
  JOIN_CODE_INVALID: "가입코드가 맞지 않아요",
  JOIN_CODE_LOCKED: "여러 번 틀려서 잠시 뒤 다시 입력할 수 있어요",
  REPORT_LINK_EXPIRED: "보관 기간이 지나 더 이상 확인할 수 없어요",
  NOTICE_ENDED: "종료된 공지예요",
  INVITE_EXPIRED: "초대 링크의 기간이 지났어요. 월계함 팀에 새 링크를 요청해 주세요",
  RATE_LIMITED: "요청이 많아요. 잠시 뒤 다시 시도해 주세요",
  REPORT_TOO_FREQUENT: "같은 내용을 방금 보냈어요. 잠시 뒤 다시 보내 주세요",
  KAKAO_NOT_CONFIGURED: "지금은 카카오 로그인을 쓸 수 없어요",
  ALREADY_CONNECTED: "이미 다른 건물에 연결되어 있어요. 연결을 옮길지 먼저 확인해 주세요",
  PAYLOAD_TOO_LARGE: "내용이 너무 길어요. 조금 줄여서 다시 보내 주세요",
};

export function errorMessage(error: unknown): string {
  return messages[toAppError(error).code];
}
