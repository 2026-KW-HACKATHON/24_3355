import { z } from "zod";
import { createDatabase } from "../lib/db.ts";
import { EnvFields } from "../lib/env.ts";
import { issueInvite } from "../modules/buildings/service.ts";

// 사용: pnpm --filter @wolgyeham/api db:invite <buildingId> [유효 일수, 기본 7]
// 토큰 원문은 이 출력에서 한 번만 보입니다. DB에는 SHA-256 해시만 저장합니다.
const env = EnvFields.pick({ DATABASE_URL: true, APP_ORIGIN: true }).parse(process.env);
const args = z
  .tuple([z.uuid(), z.coerce.number().int().min(1).max(30).default(7)])
  .safeParse(process.argv.slice(2));
if (!args.success) {
  console.error("사용: db:invite <buildingId(uuid)> [유효 일수 1~30, 기본 7]");
  process.exit(2);
}

const [buildingId, validDays] = args.data;
const database = createDatabase(env.DATABASE_URL, { max: 1 });
try {
  const { token, building, expiresAt } = await issueInvite(database.db, buildingId, validDays);
  console.info(`건물: ${building.name} (${building.id})`);
  console.info(`만료: ${expiresAt?.toISOString()}`);
  console.info(`초대 링크(한 번만 표시): ${env.APP_ORIGIN}/invite#t=${token}`);
} catch (error) {
  console.error(
    error instanceof Error && error.name === "AppError" ? "건물을 찾을 수 없습니다." : error,
  );
  process.exitCode = 1;
} finally {
  await database.close();
}
