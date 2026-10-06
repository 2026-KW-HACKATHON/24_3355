import { inArray, lt, sql } from "drizzle-orm";
import { rateLimits } from "../db/schema.ts";
import type { Database } from "./db.ts";
import { AppError } from "./errors.ts";

/** 한 번에 지우는 오래된 행 수. 요청마다 조금씩 지워 요청 시간이 늘지 않게 합니다. */
const STALE_DELETE_LIMIT = 100;

/**
 * 고정 창 횟수 제한. (`bucket`, `key`)마다 한 문장(upsert)으로 세므로 동시 요청도 빠짐없이 셉니다. 창이 지났으면
 * 1부터 다시 셉니다. 이번 요청으로 `limit`을 넘으면 429 `RATE_LIMITED`와 `Retry-After`(창이 끝날 때까지 남은 초)를
 * 던집니다. 하루 넘게 쓰이지 않은 행은 부를 때마다 100행씩 지웁니다.
 */
export async function hitRateLimit(
  db: Database,
  bucket: string,
  key: string,
  options: { limit: number; windowSeconds: number },
) {
  const t = rateLimits;
  const window = sql`make_interval(secs => ${options.windowSeconds}::int)`;
  const restart = sql`${t.windowStartedAt} <= now() - ${window}`;
  const [row] = await db
    .insert(t)
    .values({ bucket, subjectKey: key, hitCount: 1, windowStartedAt: sql`now()` })
    .onConflictDoUpdate({
      target: [t.bucket, t.subjectKey],
      set: {
        hitCount: sql`case when ${restart} then 1 else ${t.hitCount} + 1 end`,
        windowStartedAt: sql`case when ${restart} then now() else ${t.windowStartedAt} end`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ hitCount: t.hitCount, windowStartedAt: t.windowStartedAt });
  const stale = db
    .select({ id: t.id })
    .from(t)
    .where(lt(t.updatedAt, sql`now() - interval '1 day'`))
    .limit(STALE_DELETE_LIMIT);
  await db.delete(t).where(inArray(t.id, stale));
  if (row && row.hitCount > options.limit) {
    const retryAt = row.windowStartedAt.getTime() + options.windowSeconds * 1000;
    const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
    throw new AppError(429, "RATE_LIMITED", undefined, { "Retry-After": String(seconds) });
  }
}
