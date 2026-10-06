import { REPORT_STATUSES, REPORTER_KINDS } from "@wolgyeham/contracts";
import { describe, expect, it } from "vitest";
import { AppError } from "../../lib/errors";
import { formatDay } from "../../lib/format";
import {
  formatReportTime,
  REPORT_STATUS,
  REPORTER_KIND,
  reportDateLine,
  reportSendError,
  reportStatusLine,
  reportTitle,
} from "./labels";
import { REPORT_SENT_STATE, readReportSent } from "./sentState";

describe("report status labels", () => {
  it("names every status with text and a distinct badge", () => {
    // Given / When
    const labels = REPORT_STATUSES.map((status) => REPORT_STATUS[status].label);
    const badges = new Set(REPORT_STATUSES.map((status) => REPORT_STATUS[status].badge));
    // Then
    expect(labels).toEqual(["접수됨", "확인함", "처리 완료", "처리가 어려움"]);
    expect(badges.size).toBe(REPORT_STATUSES.length);
  });

  it("names the three reporter kinds without calling anyone anonymous", () => {
    // Given / When
    const labels = REPORTER_KINDS.map((kind) => REPORTER_KIND[kind].label);
    // Then
    expect(labels).toEqual(["비회원", "회원", "거주자"]);
    expect(REPORTER_KIND.guest.how).toContain("확인 링크");
    for (const kind of REPORTER_KINDS) expect(REPORTER_KIND[kind].how).not.toContain("익명");
  });

  it("titles a preset report by its phrase and a custom one by what was written", () => {
    expect(reportTitle({ preset: "trash_overflow", kind: "trash", body: "옆 골목" })).toBe(
      "건물 앞 쓰레기가 넘쳤어요",
    );
    expect(reportTitle({ preset: null, kind: "noise", body: "밤마다 웅웅거려요" })).toBe(
      "밤마다 웅웅거려요",
    );
  });

  it("formats times in Korea time like the lofi", () => {
    expect(formatReportTime("2026-09-25T06:12:00.000Z")).toBe("9월 25일 오후 3:12");
  });

  it("says what the landlord marked, not that it was solved", () => {
    // Given
    const base = { acknowledgedAt: "2026-09-25T08:40:00.000Z", resolvedAt: null };
    // When
    const received = reportStatusLine({ ...base, status: "received" }, formatDay);
    const done = reportStatusLine(
      { ...base, status: "completed", resolvedAt: "2026-09-26T00:10:00.000Z" },
      formatDay,
    );
    // Then
    expect(received).toBe("접수됨 · 집주인은 아직 확인 전이에요");
    expect(done).toBe("집주인이 처리 완료로 표시했어요 · 9월 26일");
  });

  it("writes the sent-list date line like lofi 21", () => {
    const sent = { createdAt: "2026-09-12T01:00:00.000Z", acknowledgedAt: null, resultNote: null };
    expect(reportDateLine({ ...sent, status: "received", resolvedAt: null }, formatDay)).toBe(
      "9월 12일 보냄",
    );
    expect(
      reportDateLine(
        { ...sent, status: "completed", resolvedAt: "2026-09-15T01:00:00.000Z" },
        formatDay,
      ),
    ).toBe("9월 12일 보냄 · 9월 15일 처리 완료로 표시");
    expect(
      reportDateLine(
        {
          ...sent,
          status: "unable",
          resolvedAt: "2026-09-15T01:00:00.000Z",
          resultNote: "어려워요",
        },
        formatDay,
      ),
    ).toBe("9월 12일 보냄 · 집주인 메모 있음");
  });
});

describe("send errors", () => {
  it("tells how long to wait on 429 using Retry-After", () => {
    // Given
    const same = new AppError("REPORT_TOO_FREQUENT", { retryAfterSeconds: 481 });
    const many = new AppError("RATE_LIMITED", { retryAfterSeconds: 30 });
    const unknown = new AppError("REPORT_TOO_FREQUENT");
    // When / Then
    expect(reportSendError(same)).toBe("같은 내용을 방금 보냈어요. 9분 뒤에 다시 보낼 수 있어요");
    expect(reportSendError(many)).toBe("짧은 시간에 여러 번 보냈어요. 1분 뒤에 다시 보내 주세요");
    expect(reportSendError(unknown)).toContain("잠시 뒤에");
  });

  it("explains that the landlord cannot report to their own building", () => {
    expect(reportSendError(new AppError("FORBIDDEN"))).toContain(
      "집주인 계정으로는 보낼 수 없어요",
    );
  });

  it("keeps the input on connection problems", () => {
    expect(reportSendError(new AppError("NETWORK"))).toContain("적은 내용은 그대로 있어요");
  });

  it("says the earlier send may have gone through when its result was unknown", () => {
    // Given: 앞서 누른 요청이 시간 초과로 끝난 뒤 다시 눌렀더니 같은 문구 제한(429)
    const same = new AppError("REPORT_TOO_FREQUENT", { retryAfterSeconds: 481 });
    // When / Then
    expect(reportSendError(same, { afterUnknown: true })).toBe(
      "앞서 보낸 내용이 접수됐을 수 있어요. 같은 내용은 9분 뒤에 다시 보낼 수 있어요",
    );
    expect(reportSendError(same, { afterUnknown: false })).toContain("방금 보냈어요");
  });
});

describe("sent state", () => {
  it("reads whether the token was stored in this browser", () => {
    expect(readReportSent({ [REPORT_SENT_STATE]: { stored: false } })).toEqual({ stored: false });
    expect(readReportSent({ [REPORT_SENT_STATE]: { stored: true } })).toEqual({ stored: true });
    expect(readReportSent({ other: 1 })).toBeUndefined();
    expect(readReportSent(null)).toBeUndefined();
  });
});
