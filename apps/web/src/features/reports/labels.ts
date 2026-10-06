import type {
  Report,
  ReporterKind,
  ReportKind,
  ReportLocation,
  ReportPreset,
  ReportStatus,
} from "@wolgyeham/contracts";
import type { IconName } from "../../components/Icon";
import { type AppError, errorMessage } from "../../lib/errors";

// 제보(LF-10·11·16)의 화면 문구. 상태는 색과 글자를 함께 씁니다(frontend.md §7).

/** 자주 쓰는 말(01·20). 순서가 화면 순서입니다. */
export const REPORT_PRESET_COPY: Readonly<Record<ReportPreset, { text: string; icon: IconName }>> =
  {
    trash_overflow: { text: "건물 앞 쓰레기가 넘쳤어요", icon: "trash-2" },
    passage_blocked: { text: "통로를 막는 물건이 있어요", icon: "ban" },
    leak_or_broken: { text: "물이 새거나 고장 났어요", icon: "droplets" },
  };

export const REPORT_KIND_LABEL: Readonly<Record<ReportKind, string>> = {
  trash: "쓰레기·분리수거",
  passage: "통행 방해",
  noise: "소음",
  facility: "누수·설비",
  other: "기타",
};

export const REPORT_LOCATION_LABEL: Readonly<Record<ReportLocation, string>> = {
  alley: "건물 앞 골목",
  recycling_area: "분리수거함",
  stairs_hallway: "계단·복도",
  parking: "주차장",
};

type Badge = "received" | "checked" | "done" | "hard";

/** 상태 배지: 접수됨·확인함·처리 완료·처리가 어려움. */
export const REPORT_STATUS: Readonly<
  Record<ReportStatus, { label: string; badge: Badge; icon?: IconName }>
> = {
  received: { label: "접수됨", badge: "received" },
  acknowledged: { label: "확인함", badge: "checked" },
  completed: { label: "처리 완료", badge: "done", icon: "circle-check" },
  unable: { label: "처리가 어려움", badge: "hard", icon: "circle-alert" },
};

/** 집주인에게 보이는 보낸 사람 구분(D-21). 이름·계정은 없습니다. */
export const REPORTER_KIND: Readonly<Record<ReporterKind, { label: string; how: string }>> = {
  resident: { label: "거주자", how: "이 건물 거주자 · 내 정보에서 상태를 봐요" },
  member: { label: "회원", how: "로그인한 회원 · 내 정보에서 상태를 봐요" },
  guest: { label: "비회원", how: "비회원 · 확인 링크로 상태만 봐요" },
};

/** 목록·상세의 제목: 자주 쓰는 말이면 그 문구, 직접 적었으면 적은 내용. */
export function reportTitle(report: Pick<Report, "preset" | "kind" | "body">): string {
  if (report.preset) return REPORT_PRESET_COPY[report.preset].text;
  return report.body ?? REPORT_KIND_LABEL[report.kind];
}

const dateTimeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "9월 25일 오후 3:12" (lofi 06·07·31). */
export function formatReportTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** 재방문 배너(30)의 한 줄: 지금 상태를 집주인이 표시한 대로 말합니다. */
export function reportStatusLine(
  report: Pick<Report, "status" | "acknowledgedAt" | "resolvedAt">,
  day: (iso: string) => string,
): string {
  switch (report.status) {
    case "received":
      return "접수됨 · 집주인은 아직 확인 전이에요";
    case "acknowledged":
      return report.acknowledgedAt
        ? `집주인이 확인했어요 · ${day(report.acknowledgedAt)}`
        : "집주인이 확인했어요";
    case "completed":
      return report.resolvedAt
        ? `집주인이 처리 완료로 표시했어요 · ${day(report.resolvedAt)}`
        : "집주인이 처리 완료로 표시했어요";
    case "unable":
      return report.resolvedAt
        ? `집주인이 처리가 어렵다고 표시했어요 · ${day(report.resolvedAt)}`
        : "집주인이 처리가 어렵다고 표시했어요";
  }
}

/** Retry-After(초)를 분으로. 모르면 undefined. */
function minutesLeft(error: AppError): number | undefined {
  const seconds = error.retryAfterSeconds;
  return seconds === undefined ? undefined : Math.max(1, Math.ceil(seconds / 60));
}

/**
 * 보내기 실패 문구. 입력은 그대로 두고 버튼 위에 보여줍니다. 자동으로 다시 보내지 않습니다.
 * 반복 제한(429)은 남은 시간을 함께, 집주인 계정(403 FORBIDDEN)은 이유를 알려 줍니다.
 */
export function reportSendError(
  error: AppError,
  { afterUnknown = false }: { afterUnknown?: boolean } = {},
): string {
  const minutes = minutesLeft(error);
  switch (error.code) {
    case "REPORT_TOO_FREQUENT":
      // 앞서 누른 요청이 결과를 모른 채 끝났다면 그 요청이 접수된 것일 수 있습니다(리뷰 L9).
      if (afterUnknown) {
        return minutes
          ? `앞서 보낸 내용이 접수됐을 수 있어요. 같은 내용은 ${minutes}분 뒤에 다시 보낼 수 있어요`
          : "앞서 보낸 내용이 접수됐을 수 있어요. 같은 내용은 잠시 뒤에 다시 보낼 수 있어요";
      }
      return minutes
        ? `같은 내용을 방금 보냈어요. ${minutes}분 뒤에 다시 보낼 수 있어요`
        : "같은 내용을 방금 보냈어요. 잠시 뒤에 다시 보내 주세요";
    case "RATE_LIMITED":
      return minutes
        ? `짧은 시간에 여러 번 보냈어요. ${minutes}분 뒤에 다시 보내 주세요`
        : "짧은 시간에 여러 번 보냈어요. 잠시 뒤에 다시 보내 주세요";
    case "FORBIDDEN":
      return "이 건물의 집주인 계정으로는 보낼 수 없어요. 받은 내용은 관리 화면에서 확인해요";
    case "NETWORK":
    case "INTERNAL_ERROR":
      return "보내지 못했어요. 적은 내용은 그대로 있어요. 다시 눌러 주세요";
    case "VALIDATION_FAILED":
      return "보낼 내용을 확인해 주세요";
    case "NOT_FOUND":
      return "건물 정보를 찾을 수 없어요";
    default:
      return errorMessage(error);
  }
}

/** 보낸 내용(21) 한 행의 날짜 줄. 집주인이 남긴 말이 있으면 그것을 먼저 알립니다. */
export function reportDateLine(
  report: Pick<Report, "status" | "createdAt" | "acknowledgedAt" | "resolvedAt" | "resultNote">,
  day: (iso: string) => string,
): string {
  const sent = `${day(report.createdAt)} 보냄`;
  if (report.status === "received") return sent;
  if (report.status === "acknowledged") {
    return report.acknowledgedAt ? `${sent} · ${day(report.acknowledgedAt)} 확인` : sent;
  }
  if (report.resultNote) return `${sent} · 집주인 메모 있음`;
  const label = report.status === "completed" ? "처리 완료로" : "처리가 어려움으로";
  return report.resolvedAt ? `${sent} · ${day(report.resolvedAt)} ${label} 표시` : sent;
}
