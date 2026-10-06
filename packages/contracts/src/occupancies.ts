import { z } from "zod";

/** 연결 상태. DB CHECK와 같은 목록입니다(screens.md §3). */
export const OCCUPANCY_STATUSES = ["active", "reconfirm_needed", "inactive"] as const;
export const OccupancyStatus = z.enum(OCCUPANCY_STATUSES);
export type OccupancyStatus = z.infer<typeof OccupancyStatus>;

/** 가입코드 길이. 서버가 만드는 코드는 헷갈리는 글자(0·O·1·I·L)를 쓰지 않습니다. */
export const JOIN_CODE_LENGTH = 6;
/** 이 횟수만큼 틀리면 `JOIN_CODE_LOCK_MINUTES` 동안 429 `JOIN_CODE_LOCKED`입니다. */
export const JOIN_CODE_MAX_FAILURES = 5;
export const JOIN_CODE_LOCK_MINUTES = 10;

/**
 * 입력한 가입코드. 앞뒤 공백을 지우고 대문자로 바꾼 뒤, 글자 사이의 공백이나 `-` 하나까지 받습니다
 * (예: `wk7 2p4`, `WK7-2P4`). 비교 전에는 `normalizeJoinCode`로 구분자를 뺍니다.
 */
export const JoinCodeInput = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9](?:[\s-]?[A-Z0-9]){5}$/);

/** 구분자를 뺀 6자리 대문자 코드. */
export function normalizeJoinCode(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export const JoinCodeCheckBody = z.object({ code: JoinCodeInput });
export type JoinCodeCheckBody = z.infer<typeof JoinCodeCheckBody>;

/** 가입코드가 맞음(로그인 전 1/2 단계). 연결은 아직 만들지 않았습니다. */
export const JoinCodeCheckResult = z.object({ buildingId: z.uuid(), buildingName: z.string() });
export type JoinCodeCheckResult = z.infer<typeof JoinCodeCheckResult>;

/** 집주인이 보는 현재 가입코드(LF-18). */
export const JoinCode = z.object({ code: z.string(), createdAt: z.iso.datetime() });
export type JoinCode = z.infer<typeof JoinCode>;

/** 아직 코드를 만들지 않았으면 null입니다. `POST …/join-code`로 만듭니다. */
export const CurrentJoinCode = z.object({ joinCode: JoinCode.nullable() });
export type CurrentJoinCode = z.infer<typeof CurrentJoinCode>;

/** 재확인을 요청한 뒤 이 기간 안에 답하지 않으면 `reconfirm_needed`입니다(LF-09, 40). */
export const RECONFIRM_GRACE_DAYS = 14;

/**
 * 연결. `status`와 재확인 필드는 요청한 때를 기준으로 계산한 값입니다(스케줄러 없음).
 * - `nextReconfirmAt`: 재확인을 요청하는 시각(연결·‘아직 살아요’ 뒤 서버 설정 기간, 기본 365일). 내 정보(45)의 ‘다음 거주 확인’.
 * - `reconfirmRequested`: 이 시각이 지나 답을 기다리는 중(시트 40·홈 배너). `reconfirm_needed`여도 true.
 * - `reconfirmDueAt`: 이때까지 답하지 않으면 `reconfirm_needed`가 되어 쓰기·공지 알림이 멈춥니다.
 */
export const Occupancy = z.object({
  id: z.uuid(),
  buildingId: z.uuid(),
  status: OccupancyStatus,
  connectedAt: z.iso.datetime(),
  lastReconfirmedAt: z.iso.datetime().nullable(),
  nextReconfirmAt: z.iso.datetime(),
  reconfirmRequested: z.boolean(),
  reconfirmDueAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
});
export type Occupancy = z.infer<typeof Occupancy>;

export const OccupancyParams = z.object({ occupancyId: z.uuid() });
export type OccupancyParams = z.infer<typeof OccupancyParams>;

/** ‘아직 살아요’(active, 확인 시각 갱신)와 ‘이사했어요’(inactive)의 결과. */
export const OccupancyResult = z.object({ occupancy: Occupancy });
export type OccupancyResult = z.infer<typeof OccupancyResult>;

/**
 * 연결 요청(로그인 후 2/2 단계). 코드를 다시 확인합니다.
 * 다른 건물에 살아 있는 연결이 있으면 그 id를 `replaceOccupancyId`로 보내야 옮깁니다(사용자 확인 후).
 */
export const ConnectBody = z.object({
  code: JoinCodeInput,
  replaceOccupancyId: z.uuid().optional(),
});
export type ConnectBody = z.infer<typeof ConnectBody>;

/**
 * `alreadyConnected`: 이미 이 건물과 연결돼 있어 새 연결을 만들지 않았음.
 * `reconfirmed`: 이미 연결돼 있고 재확인 요청 중(또는 reconfirm_needed)이었는데 지금 가입코드를 다시 맞혀서
 *   ‘아직 살아요’와 같이 처리했음(active, 확인 시각 갱신).
 * `endedOccupancyId`: 이번 요청으로 끝낸 이전 건물의 연결. 이때 이 계정의 푸시 구독도 지워서 웹이 알림 선택을
 *   다시 묻습니다(screens.md §6).
 */
export const ConnectResult = z.object({
  occupancy: Occupancy,
  alreadyConnected: z.boolean(),
  reconfirmed: z.boolean(),
  endedOccupancyId: z.uuid().nullable(),
});
export type ConnectResult = z.infer<typeof ConnectResult>;
