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
