import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { drizzle, type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.ts";

/** Drizzle 클라이언트와 트랜잭션이 함께 만족하는 타입. repo 함수는 이 타입을 받습니다. */
export type Database = PgDatabase<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type DatabaseClient = ReturnType<typeof createDatabase>;

/** 프로세스마다 풀 하나를 만듭니다. 종료할 때 `close()`를 부릅니다. */
export function createDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
  const db: Database = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}

/** 유니크 제약 위반(23505). Drizzle은 드라이버 오류를 `cause`에 담습니다. */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error; typeof current === "object" && current; current = current.cause) {
    if ("code" in current && current.code === "23505") return true;
    if (!("cause" in current)) break;
  }
  return false;
}
