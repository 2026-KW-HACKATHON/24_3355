import type { Notice } from "@wolgyeham/contracts";
import {
  and,
  count,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  notInArray,
  sql,
} from "drizzle-orm";
import { noticeDeliveries, notices, occupancies, pushSubscriptions } from "../../db/schema.ts";
import type { Database } from "../../lib/db.ts";
import { activeNow } from "../../lib/reconfirm.ts";

export type NoticeRow = typeof notices.$inferSelect;

export function toNotice(row: NoticeRow): Notice {
  return {
    id: row.id,
    buildingId: row.buildingId,
    title: row.title,
    body: row.body,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    publishedAt: row.publishedAt.toISOString(),
  };
}

/** 끝나지 않은 공지. 만료 판단은 항상 `ends_at < now()`입니다(database.md §5). */
function running(buildingId: string) {
  return and(
    eq(notices.buildingId, buildingId),
    eq(notices.status, "published"),
    lte(notices.publishedAt, sql`now()`),
    gte(notices.endsAt, sql`now()`),
  );
}

export async function findCurrentNotice(db: Database, buildingId: string) {
  const [row] = await db
    .select()
    .from(notices)
    .where(running(buildingId))
    .orderBy(desc(notices.publishedAt))
    .limit(1);
  return row;
}

export function listRunningNotices(db: Database, buildingId: string) {
  return db.select().from(notices).where(running(buildingId)).orderBy(desc(notices.publishedAt));
}

export async function findNotice(db: Database, noticeId: string) {
  const [row] = await db.select().from(notices).where(eq(notices.id, noticeId)).limit(1);
  return row;
}

export async function insertNotice(
  db: Database,
  values: {
    buildingId: string;
    title: string;
    body: string;
    startsAt: Date;
    endsAt: Date;
    authorUserId: string;
  },
) {
  const [row] = await db.insert(notices).values(values).returning();
  return row;
}

/**
 * 이 건물에서 지금 active이고 푸시 구독이 하나라도 있는 연결. 공지 알림 대상입니다.
 * 재확인 기한이 지난 연결(reconfirm_needed)과 이사한 연결(inactive)은 빠집니다.
 */
function pushTargetsOf(buildingId: string) {
  return and(
    eq(occupancies.buildingId, buildingId),
    activeNow(),
    exists(
      sql`(select 1 from ${pushSubscriptions} where ${pushSubscriptions.userId} = ${occupancies.userId})`,
    ),
  );
}

/** 게시 트랜잭션 안에서 알림 대상마다 `notice_deliveries` 한 행을 만들고 만든 행을 돌려줍니다. */
export async function insertDeliveries(db: Database, noticeId: string, buildingId: string) {
  const targets = await db
    .select({ id: occupancies.id })
    .from(occupancies)
    .where(pushTargetsOf(buildingId));
  if (targets.length === 0) return [];
  return db
    .insert(noticeDeliveries)
    .values(targets.map((target) => ({ noticeId, occupancyId: target.id })))
    .returning({ id: noticeDeliveries.id });
}

export type DeliveryTarget = {
  deliveryId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** 발송할 구독. 한 사람(발송 행)이 브라우저 여러 개를 쓰면 행이 여러 개입니다. */
export function listDeliveryTargets(db: Database, noticeId: string): Promise<DeliveryTarget[]> {
  return db
    .select({
      deliveryId: noticeDeliveries.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(noticeDeliveries)
    .innerJoin(occupancies, eq(occupancies.id, noticeDeliveries.occupancyId))
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, occupancies.userId))
    .where(eq(noticeDeliveries.noticeId, noticeId));
}

/** 이 대상에게 처음 발송을 시작할 때 한 번 `attempted_at`을 적습니다(같은 사람의 두 번째 브라우저는 그대로). */
export async function markDeliveryAttempted(db: Database, deliveryId: string) {
  await db
    .update(noticeDeliveries)
    .set({ attemptedAt: sql`now()` })
    .where(and(eq(noticeDeliveries.id, deliveryId), isNull(noticeDeliveries.attemptedAt)));
}

/**
 * 이 사용자의 연결(지금 것과 끝난 것 모두)에 이 공지의 발송 행이 있으면 처음 한 번만 `opened_at`을 적습니다.
 * 적은 행 수를 돌려줍니다(대상이 아니었거나 이미 적었으면 0).
 */
export async function markDeliveryOpened(db: Database, noticeId: string, userId: string) {
  const rows = await db
    .update(noticeDeliveries)
    .set({ openedAt: sql`now()` })
    .where(
      and(
        eq(noticeDeliveries.noticeId, noticeId),
        isNull(noticeDeliveries.openedAt),
        inArray(
          noticeDeliveries.occupancyId,
          db.select({ id: occupancies.id }).from(occupancies).where(eq(occupancies.userId, userId)),
        ),
      ),
    )
    .returning({ id: noticeDeliveries.id });
  return rows.length;
}

export async function countAudience(db: Database, buildingId: string) {
  const [connected] = await db
    .select({ value: count() })
    .from(occupancies)
    .where(and(eq(occupancies.buildingId, buildingId), activeNow()));
  const [push] = await db
    .select({ value: count() })
    .from(occupancies)
    .where(pushTargetsOf(buildingId));
  return { connectedCount: connected?.value ?? 0, pushTargetCount: push?.value ?? 0 };
}

/**
 * 같은 브라우저(endpoint)로 다른 계정이 구독하면 그 계정으로 옮깁니다. 이미 있는 구독의 `auth`(브라우저만 아는
 * 비밀)가 같을 때만 바꾸므로, endpoint만 아는 다른 사람이 남의 구독을 가져가지 못합니다(그때는 아무것도 바꾸지 않음).
 * 다시 저장하면 `updated_at`을 지금으로, 실패 횟수를 0으로 둡니다.
 */
export async function upsertPushSubscription(
  db: Database,
  values: { userId: string; endpoint: string; p256dh: string; auth: string },
) {
  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: values.userId,
        p256dh: values.p256dh,
        auth: values.auth,
        failureCount: 0,
        updatedAt: sql`now()`,
      },
      setWhere: sql`${pushSubscriptions.auth} = excluded.auth`,
    });
}

/** 이 사용자의 구독 중 최근에 저장한 `keep`개만 남기고 지웁니다. */
export async function trimUserPushSubscriptions(db: Database, userId: string, keep: number) {
  const newest = db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.updatedAt), desc(pushSubscriptions.id))
    .limit(keep);
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), notInArray(pushSubscriptions.id, newest)));
}

/** 보냈으면 이어진 실패 횟수를 0으로 둡니다. */
export async function resetPushFailures(db: Database, endpoint: string) {
  await db
    .update(pushSubscriptions)
    .set({ failureCount: 0 })
    .where(and(eq(pushSubscriptions.endpoint, endpoint), gt(pushSubscriptions.failureCount, 0)));
}

/** 404·410이 아닌 실패를 한 번 세고, `limit`번 이어졌으면 그 구독을 지웁니다. 지웠으면 true. */
export async function recordPushFailure(db: Database, endpoint: string, limit: number) {
  const [row] = await db
    .update(pushSubscriptions)
    .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .returning({ failureCount: pushSubscriptions.failureCount });
  if (!row || row.failureCount < limit) return false;
  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.endpoint, endpoint), gte(pushSubscriptions.failureCount, limit)),
    );
  return true;
}

export async function deleteUserPushSubscription(db: Database, userId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function deleteAllUserPushSubscriptions(db: Database, userId: string) {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

/** 푸시 서비스가 404·410을 돌려준 구독을 지웁니다. */
export async function deletePushSubscriptions(db: Database, endpoints: string[]) {
  if (endpoints.length === 0) return;
  await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, endpoints));
}
