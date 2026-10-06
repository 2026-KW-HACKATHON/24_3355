import { z } from "zod";
import { CONTROL_CHARACTER_MESSAGE, MULTILINE_TEXT, SINGLE_LINE_TEXT } from "./text.ts";

/**
 * 제보 상태. 화면 문구: 접수됨·확인함·처리 완료·처리가 어려움. DB CHECK와 같은 목록입니다(screens.md §3).
 * received → acknowledged(‘확인했어요’ 버튼으로만) → completed | unable. 역방향은 없습니다.
 */
export const REPORT_STATUSES = ["received", "acknowledged", "completed", "unable"] as const;
export const ReportStatus = z.enum(REPORT_STATUSES);
export type ReportStatus = z.infer<typeof ReportStatus>;

/** 처리 결과(LF-16, 35). */
export const REPORT_RESULTS = ["completed", "unable"] as const;
export const ReportResult = z.enum(REPORT_RESULTS);
export type ReportResult = z.infer<typeof ReportResult>;

/** 제보 종류(직접 적기, 05). 화면 문구: 쓰레기·분리수거·통행 방해·소음·누수·설비·기타. */
export const REPORT_KINDS = ["trash", "passage", "noise", "facility", "other"] as const;
export const ReportKind = z.enum(REPORT_KINDS);
export type ReportKind = z.infer<typeof ReportKind>;

/** 어디에서 발견했나요(선택, 05). 화면 문구: 건물 앞 골목·분리수거함·계단·복도·주차장. */
export const REPORT_LOCATIONS = ["alley", "recycling_area", "stairs_hallway", "parking"] as const;
export const ReportLocation = z.enum(REPORT_LOCATIONS);
export type ReportLocation = z.infer<typeof ReportLocation>;

/**
 * 공개 화면의 자주 쓰는 말(01, 20). 화면 문구: 건물 앞 쓰레기가 넘쳤어요·통로를 막는 물건이 있어요·
 * 물이 새거나 고장 났어요. 문구를 바꿔도 키는 그대로 두고, 종류는 `REPORT_PRESET_KINDS`로 정합니다.
 */
export const REPORT_PRESETS = ["trash_overflow", "passage_blocked", "leak_or_broken"] as const;
export const ReportPreset = z.enum(REPORT_PRESETS);
export type ReportPreset = z.infer<typeof ReportPreset>;

export const REPORT_PRESET_KINDS: Readonly<Record<ReportPreset, ReportKind>> = {
  trash_overflow: "trash",
  passage_blocked: "passage",
  leak_or_broken: "facility",
};

/**
 * 집주인에게 보이는 보낸 사람 구분(screens.md §4). 보낸 시점 기준으로
 * `resident`: 이 건물 거주자(active·reconfirm_needed), `member`: 로그인했지만 이 건물 거주자가 아님(내 정보에서
 * 상태를 봄), `guest`: 로그인하지 않음(비회원, 확인 링크로 상태를 봄).
 */
export const REPORTER_KINDS = ["guest", "member", "resident"] as const;
export const ReporterKind = z.enum(REPORTER_KINDS);
export type ReporterKind = z.infer<typeof ReporterKind>;

/** 직접 적은 내용·덧붙인 내용의 글자 수(README §13). */
export const REPORT_BODY_MAX = 300;
/** 처리 결과와 함께 남기는 ‘보낸 분께 한 줄’. 줄바꿈 없이 이 글자 수 이하입니다. */
export const REPORT_RESULT_NOTE_MAX = 100;
/** 비회원 확인 링크(조회 토큰)의 유효 기간. */
export const REPORT_ACCESS_DAYS = 30;
/** 같은 사람이 같은 건물에 같은 문구를 다시 보낼 수 있기까지의 간격(429 `REPORT_TOO_FREQUENT`). */
export const REPORT_REPEAT_MINUTES = 10;
/** 같은 사람이 한 건물에 한 시간에 보낼 수 있는 제보 수(넘으면 429 `RATE_LIMITED`). */
export const REPORT_HOURLY_LIMIT = 10;
/** `POST …/reports/lookup` 한 번에 확인하는 조회 토큰 수. */
export const REPORT_LOOKUP_MAX = 20;
/** 비회원 조회 토큰을 보내는 요청 헤더. 토큰은 웹 URL의 `#t=` 뒤에만 두고 API 주소·쿼리에는 넣지 않습니다. */
export const REPORT_TOKEN_HEADER = "X-Report-Token";

/**
 * 보낸 사람(계정·확인 링크)과 집주인이 함께 보는 제보. 보낸 사람의 계정은 담지 않습니다.
 * - `preset`: 자주 쓰는 말로 보냈으면 그 키, 직접 적었으면 null.
 * - `body`: 직접 적은 내용 또는 자주 쓰는 말에 덧붙인 내용. 덧붙이지 않았으면 null(07 ‘덧붙인 내용 없음’).
 * - `resultNote`: 처리 결과와 함께 남긴 한 줄(31 ‘집주인이 남긴 말’).
 */
export const Report = z.object({
  id: z.uuid(),
  buildingId: z.uuid(),
  buildingName: z.string(),
  preset: ReportPreset.nullable(),
  kind: ReportKind,
  location: ReportLocation.nullable(),
  body: z.string().nullable(),
  status: ReportStatus,
  resultNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
  acknowledgedAt: z.iso.datetime().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
});
export type Report = z.infer<typeof Report>;

/** 집주인의 받은 내용(LF-16). 보낸 사람은 거주자·회원·비회원 구분만 담습니다. */
export const ManagedReport = Report.extend({ reporterKind: ReporterKind });
export type ManagedReport = z.infer<typeof ManagedReport>;

/** 최근에 받은 순서로 최대 200건입니다. */
export const ManagedReportList = z.object({ reports: z.array(ManagedReport) });
export type ManagedReportList = z.infer<typeof ManagedReportList>;

/** 내 정보 › 보낸 내용(LF-08, 21). 이 계정으로 보낸 제보만, 최근 순서로 최대 100건입니다. */
export const MyReportList = z.object({ reports: z.array(Report) });
export type MyReportList = z.infer<typeof MyReportList>;

/**
 * `GET /reports/:reportId`. `viewer`로 화면을 고릅니다: 보낸 사람(06·31) 또는 집주인(07·35).
 * `reporterKind`는 집주인에게만 있고, `accessExpiresAt`은 확인 링크(조회 토큰)로 볼 때 그 링크의 만료 시각입니다.
 */
export const REPORT_VIEWERS = ["reporter", "manager"] as const;
export const ReportViewer = z.enum(REPORT_VIEWERS);
export type ReportViewer = z.infer<typeof ReportViewer>;

export const ReportDetail = Report.extend({
  viewer: ReportViewer,
  reporterKind: ReporterKind.nullable(),
  accessExpiresAt: z.iso.datetime().nullable(),
});
export type ReportDetail = z.infer<typeof ReportDetail>;

export const ReportParams = z.object({ reportId: z.uuid() });
export type ReportParams = z.infer<typeof ReportParams>;

/** 집주인 목록 거르기. 관리 홈의 ‘확인할 것’은 `?status=received`. */
export const ReportListQuery = z.object({ status: ReportStatus.optional() });
export type ReportListQuery = z.infer<typeof ReportListQuery>;

const ReportText = z
  .string()
  .trim()
  .min(1)
  .max(REPORT_BODY_MAX)
  .regex(MULTILINE_TEXT, CONTROL_CHARACTER_MESSAGE);

/**
 * 집주인에게 알리기(LF-10). 자주 쓰는 말(01 → 20 확인)은 `source: "preset"`에 덧붙일 내용(선택, 빈 문자열은
 * 없는 것으로 봄), 직접 적기(05)는 `source: "custom"`에 종류·위치(선택)·내용입니다. 사진은 아직 받지 않습니다.
 */
export const CreateReportBody = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("preset"),
    preset: ReportPreset,
    detail: z
      .string()
      .trim()
      .max(REPORT_BODY_MAX)
      .regex(MULTILINE_TEXT, CONTROL_CHARACTER_MESSAGE)
      .optional(),
  }),
  z.object({
    source: z.literal("custom"),
    kind: ReportKind,
    location: ReportLocation.optional(),
    body: ReportText,
  }),
]);
export type CreateReportBody = z.infer<typeof CreateReportBody>;

/**
 * 보낸 결과. 로그인하지 않고 보냈으면 `accessToken`(확인 링크용, 이 응답에서 한 번만)과 만료 시각을 줍니다.
 * 웹은 토큰을 이 브라우저에 건물별로 보관하고(같은 브라우저 재조회, 30) 확인 링크 `/r/:reportId#t=<토큰>`을
 * 만듭니다. 로그인해서 보냈으면 둘 다 null이고 내 정보 › 보낸 내용에서 봅니다.
 */
export const CreateReportResult = z.object({
  report: Report,
  accessToken: z.string().nullable(),
  accessExpiresAt: z.iso.datetime().nullable(),
});
export type CreateReportResult = z.infer<typeof CreateReportResult>;

const ReportToken = z.string().min(16).max(128);

/** 같은 브라우저 재조회(30): 이 건물에 보관한 조회 토큰들. */
export const ReportLookupBody = z.object({
  tokens: z.array(ReportToken).min(1).max(REPORT_LOOKUP_MAX),
});
export type ReportLookupBody = z.infer<typeof ReportLookupBody>;

/**
 * 보낸 토큰과 같은 순서입니다. 없거나 만료됐거나 다른 건물의 토큰이면 그 자리가 null이라 웹은 그 토큰을 지웁니다.
 */
export const ReportLookupResult = z.object({ reports: z.array(Report.nullable()) });
export type ReportLookupResult = z.infer<typeof ReportLookupResult>;

const ResultNote = z
  .string()
  .trim()
  .max(REPORT_RESULT_NOTE_MAX)
  .regex(SINGLE_LINE_TEXT, "note must be a single line without control characters");

/**
 * 처리 결과 저장(LF-16, 35). ‘확인했어요’ 뒤에만 합니다. `note`(보낸 분께 한 줄)는 결과와 관계없이 선택이고
 * (빈 문자열은 없는 것으로 봄), 있으면 줄바꿈 없이 100자 이하입니다.
 */
export const ResolveReportBody = z.object({ result: ReportResult, note: ResultNote.optional() });
export type ResolveReportBody = z.infer<typeof ResolveReportBody>;
