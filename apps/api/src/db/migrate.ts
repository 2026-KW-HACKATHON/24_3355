import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { EnvFields } from "../lib/env.ts";
import { log } from "../lib/log.ts";

/** 여러 프로세스가 동시에 마이그레이션하지 않도록 거는 advisory lock 키. */
const MIGRATION_LOCK_KEY = 33550001;

/**
 * 소스(apps/api/src/db/migrate.ts → apps/api/drizzle)와
 * 이미지(/app/migrate.mjs → /app/drizzle) 양쪽에서 SQL 폴더를 찾습니다.
 */
export function migrationsFolder(): string {
  for (const candidate of ["./drizzle", "../../drizzle"]) {
    const folder = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(`${folder}/meta/_journal.json`)) return folder;
  }
  throw new Error("Migration folder (drizzle/meta/_journal.json) not found");
}

export async function migrateDatabase(url: string) {
  // 연결 하나에서 잠금과 마이그레이션을 함께 실행합니다. 연결을 닫으면 잠금이 풀립니다.
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    await migrate(drizzle(client), { migrationsFolder: migrationsFolder() });
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (import.meta.main) {
  const env = EnvFields.pick({ DATABASE_URL: true, NODE_ENV: true }).parse(process.env);
  try {
    await migrateDatabase(env.DATABASE_URL);
    log("info", "db_migrated");
  } catch (error) {
    // 배포 로그에는 DB 오류 메시지를 남기지 않습니다(값이 섞일 수 있음). 로컬에서는 원인을 보여줍니다.
    log("error", "db_migrate_failed", {
      name: error instanceof Error ? error.name : "unknown",
      code: typeof error === "object" && error && "code" in error ? String(error.code) : undefined,
      message: env.NODE_ENV !== "production" && error instanceof Error ? error.message : undefined,
    });
    process.exitCode = 1;
  }
}
