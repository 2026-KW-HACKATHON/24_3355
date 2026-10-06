import { SINGLE_LINE_TEXT } from "@wolgyeham/contracts";
import { z } from "zod";
import { createdMonth } from "../modules/tips/repo.ts";
import type { listTipsForModeration } from "../modules/tips/service.ts";

/** db:moderate 사용법. 가림·복원은 운영자 이름(`--by`)이 있어야 합니다. */
export const MODERATE_USAGE =
  "사용: db:moderate list | hide <tipId> --by <운영자> [사유] | restore <tipId> --by <운영자>";

const OPERATOR_NAME_MAX = 100;
const REASON_MAX = 200;
const Operator = z.string().trim().min(1).max(OPERATOR_NAME_MAX).regex(SINGLE_LINE_TEXT);

export type ModerateCommand =
  | { action: "list" }
  | { action: "hide"; tipId: string; operator: string; reason: string | null }
  | { action: "restore"; tipId: string; operator: string };

/** 인자를 읽습니다. 형식이 틀리면 undefined(사용법을 보여주고 끝냄). */
export function parseModerateArgs(argv: string[]): ModerateCommand | undefined {
  const args = argv.filter((arg) => arg !== "--");
  const byIndex = args.indexOf("--by");
  const operator = byIndex >= 0 ? Operator.safeParse(args[byIndex + 1]) : undefined;
  const rest = byIndex >= 0 ? args.filter((_, i) => i !== byIndex && i !== byIndex + 1) : args;
  const [action, tipId, ...reasonWords] = rest;
  if (action === "list" && rest.length === 1 && byIndex < 0) return { action };
  if ((action !== "hide" && action !== "restore") || !z.uuid().safeParse(tipId).success) {
    return undefined;
  }
  if (!operator?.success || !tipId) return undefined;
  if (action === "restore") {
    return reasonWords.length === 0 ? { action, tipId, operator: operator.data } : undefined;
  }
  const reason = reasonWords.join(" ").trim();
  if (reason.length > REASON_MAX || !SINGLE_LINE_TEXT.test(reason)) return undefined;
  return { action, tipId, operator: operator.data, reason: reason || null };
}

/**
 * 터미널에 찍을 글. 제어문자(U+0000–U+001F, U+007F–U+009F)는 `\u{..}`로 바꿔 사용자가 쓴 글이 터미널을
 * 조작하지 못하게 합니다(줄바꿈도 `\u{a}`로 보임).
 */
export function printable(value: string): string {
  return value.replace(
    /\p{Cc}/gu,
    (character) => `\\u{${character.codePointAt(0)?.toString(16) ?? ""}}`,
  );
}

type ModerationItem = Awaited<ReturnType<typeof listTipsForModeration>>[number];

/** `list`의 출력 줄. 신고할 때의 내용(`tip_body`)과 지금 내용이 다르면 둘 다 보여줍니다. */
export function formatModerationList(items: ModerationItem[]): string[] {
  if (items.length === 0) return ["검토할 팁이 없습니다."];
  const lines: string[] = [];
  for (const { tip, buildingName, reports, actions } of items) {
    const open = reports.filter((report) => report.status === "open").length;
    const state = [
      tip.hiddenAt ? `가림(${printable(tip.hiddenReason ?? "사유 없음")})` : "보임",
      ...(tip.deletedAt ? ["작성자가 지움"] : []),
    ].join(" · ");
    lines.push(
      `${tip.id} · ${printable(buildingName)} · ${tip.category} · ${createdMonth(tip.createdAt)} · ${state} · 신고 ${reports.length}건(검토 전 ${open})`,
      `  지금 내용: ${printable(tip.body)}`,
    );
    for (const report of reports) {
      const snapshot =
        report.tipBody !== null && report.tipBody !== tip.body
          ? ` · 신고할 때 내용: ${printable(report.tipBody)}`
          : "";
      lines.push(
        `  - 신고 ${report.status} · ${printable(report.reason ?? "사유 없음")}${snapshot}`,
      );
    }
    for (const action of actions) {
      lines.push(
        `  - 기록 ${action.createdAt.toISOString()} · ${action.action} · ${printable(action.operator)} · ${printable(action.reason ?? "")}`,
      );
    }
  }
  return lines;
}
