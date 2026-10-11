import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { rateLimits } from "../db/schema.ts";
import { createManagedBuilding, useTestApp, withCookie } from "../test/helpers.ts";
import { AppError } from "./errors.ts";
import { hitRateLimit } from "./rate-limit.ts";

const t = useTestApp();
const LIMIT = { limit: 2, windowSeconds: 60 };

/** 테스트마다 다른 키라서 다른 테스트의 횟수와 섞이지 않습니다. */
function subject() {
  return { bucket: "test_bucket", key: randomUUID() };
}

/** 창이 시작된 시각을 DB 시계 기준으로 `seconds`초 앞으로 옮깁니다(창이 지난 것처럼). */
async function rewindWindow(bucket: string, key: string, seconds: number) {
  await t.db
    .update(rateLimits)
    .set({ windowStartedAt: sql`now() - make_interval(secs => ${seconds}::int)` })
    .where(and(eq(rateLimits.bucket, bucket), eq(rateLimits.subjectKey, key)));
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("expected the rate limit to reject");
}

describe("hitRateLimit", () => {
  it("allows hits up to the limit", async () => {
    // Given
    const { bucket, key } = subject();
    // When / Then
    await expect(hitRateLimit(t.db, bucket, key, LIMIT)).resolves.toBeUndefined();
    await expect(hitRateLimit(t.db, bucket, key, LIMIT)).resolves.toBeUndefined();
  });

  it("throws 429 RATE_LIMITED with Retry-After once the limit is exceeded", async () => {
    // Given
    const { bucket, key } = subject();
    await hitRateLimit(t.db, bucket, key, LIMIT);
    await hitRateLimit(t.db, bucket, key, LIMIT);
    // When
    const error = await rejection(hitRateLimit(t.db, bucket, key, LIMIT));
    // Then
    expect(error.status).toBe(429);
    expect(error.code).toBe("RATE_LIMITED");
    const retryAfter = Number(error.headers?.["Retry-After"]);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(LIMIT.windowSeconds);
  });

  it("reports the seconds left in the current window as Retry-After", async () => {
    // Given: 창이 시작된 지 50초 지났고 이미 다 썼습니다.
    const { bucket, key } = subject();
    await hitRateLimit(t.db, bucket, key, LIMIT);
    await hitRateLimit(t.db, bucket, key, LIMIT);
    await rewindWindow(bucket, key, 50);
    // When
    const error = await rejection(hitRateLimit(t.db, bucket, key, LIMIT));
    // Then
    const retryAfter = Number(error.headers?.["Retry-After"]);
    expect(retryAfter).toBeGreaterThanOrEqual(9);
    expect(retryAfter).toBeLessThanOrEqual(11);
  });

  it("allows hits again after the window has passed", async () => {
    // Given
    const { bucket, key } = subject();
    await hitRateLimit(t.db, bucket, key, LIMIT);
    await hitRateLimit(t.db, bucket, key, LIMIT);
    await rejection(hitRateLimit(t.db, bucket, key, LIMIT));
    await rewindWindow(bucket, key, LIMIT.windowSeconds + 1);
    // When
    await expect(hitRateLimit(t.db, bucket, key, LIMIT)).resolves.toBeUndefined();
    // Then: 새 창에서 1부터 다시 셉니다.
    const [row] = await t.db
      .select({ hitCount: rateLimits.hitCount })
      .from(rateLimits)
      .where(and(eq(rateLimits.bucket, bucket), eq(rateLimits.subjectKey, key)));
    expect(row?.hitCount).toBe(1);
  });

  it("counts each key separately within a bucket", async () => {
    // Given
    const first = subject();
    const second = subject();
    await hitRateLimit(t.db, first.bucket, first.key, LIMIT);
    await hitRateLimit(t.db, first.bucket, first.key, LIMIT);
    // When / Then
    await expect(hitRateLimit(t.db, second.bucket, second.key, LIMIT)).resolves.toBeUndefined();
  });

  it("does not let concurrent hits slip past the limit", async () => {
    // Given
    const { bucket, key } = subject();
    // When
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => hitRateLimit(t.db, bucket, key, LIMIT)),
    );
    // Then
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(LIMIT.limit);
  });
});

describe("rate-limited routes", () => {
  it("answer 429 with a Retry-After header", async () => {
    // Given: 이 집주인의 사진 올리기 창(1시간 60장)을 이미 다 썼습니다.
    const { building, managerId, managerCookie } = await createManagedBuilding(t.db);
    await t.db.insert(rateLimits).values({
      bucket: "photo_upload",
      subjectKey: managerId,
      hitCount: 60,
      windowStartedAt: sql`now()`,
    });
    // When
    const response = await t.app.request(
      `/api/buildings/${building.id}/photos`,
      withCookie(managerCookie, { method: "POST" }),
    );
    // Then
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: { code: "RATE_LIMITED" } });
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
