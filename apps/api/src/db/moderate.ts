import { createDatabase } from "../lib/db.ts";
import { EnvFields } from "../lib/env.ts";
import { hideTip, listTipsForModeration, restoreTip } from "../modules/tips/service.ts";
import { formatModerationList, MODERATE_USAGE, parseModerateArgs } from "./moderate-cli.ts";

// 운영자 콘텐츠 신고 검토(LF-19). 웹 화면이 생기기 전까지 이 스크립트로 가리고 복원합니다.
// 사용: pnpm --filter @wolgyeham/api db:moderate list
//       pnpm --filter @wolgyeham/api db:moderate hide <tipId> --by <운영자> [사유]
//       pnpm --filter @wolgyeham/api db:moderate restore <tipId> --by <운영자>
// 가리거나 복원하면 그 팁의 검토 전 신고는 검토함(reviewed)이 되고, moderation_actions에 기록이 남습니다.
const command = parseModerateArgs(process.argv.slice(2));
if (!command) {
  console.error(MODERATE_USAGE);
  process.exit(2);
}
const env = EnvFields.pick({ DATABASE_URL: true }).parse(process.env);

const database = createDatabase(env.DATABASE_URL, { max: 1 });
try {
  if (command.action === "list") {
    for (const line of formatModerationList(await listTipsForModeration(database.db))) {
      console.info(line);
    }
  } else {
    const row =
      command.action === "hide"
        ? await hideTip(database.db, command.tipId, command.reason, command.operator)
        : await restoreTip(database.db, command.tipId, command.operator);
    if (!row) {
      console.error("팁을 찾을 수 없습니다.");
      process.exitCode = 1;
    } else {
      console.info(command.action === "hide" ? `가렸습니다: ${row.id}` : `복원했습니다: ${row.id}`);
    }
  }
} finally {
  await database.close();
}
