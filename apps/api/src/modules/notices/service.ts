import type {
  CreateNoticeBody,
  CreateNoticeResult,
  CurrentNoticeResponse,
  Notice,
  NoticeAudience,
  NoticePushPayload,
  PushPublicKey,
  PushSubscriptionBody,
} from "@wolgyeham/contracts";
import { requireManager, requireOccupancy } from "../../lib/auth.ts";
import type { Database } from "../../lib/db.ts";
import type { Env } from "../../lib/env.ts";
import { AppError } from "../../lib/errors.ts";
import { log } from "../../lib/log.ts";
import type { PushResult, PushSender } from "../../lib/push.ts";
import { hitRateLimit } from "../../lib/rate-limit.ts";
import type { TaskRunner } from "../../lib/tasks.ts";
import * as buildingService from "../buildings/service.ts";
import * as repo from "./repo.ts";

export async function getCurrentNotice(
  db: Database,
  buildingId: string,
): Promise<CurrentNoticeResponse> {
  await buildingService.requireBuilding(db, buildingId);
  const row = await repo.findCurrentNotice(db, buildingId);
  return { notice: row ? repo.toNotice(row) : null };
}

/** 공개 목록. 기간이 끝난 공지는 뺍니다. */
export async function listNotices(db: Database, buildingId: string): Promise<Notice[]> {
  await buildingService.requireBuilding(db, buildingId);
  return (await repo.listRunningNotices(db, buildingId)).map(repo.toNotice);
}

/** 공지 상세(누구나). 기간이 끝났으면 410 `NOTICE_ENDED`입니다. */
export async function getNotice(db: Database, noticeId: string): Promise<Notice> {
  const row = await repo.findNotice(db, noticeId);
  if (!row || row.publishedAt.getTime() > Date.now()) throw new AppError(404, "NOT_FOUND");
  if (row.status === "expired" || row.endsAt.getTime() < Date.now()) {
    throw new AppError(410, "NOTICE_ENDED");
  }
  return repo.toNotice(row);
}

/**
 * 공지 열람 기록(발송 대상 → 시도 → 열람). 로그인한 사람이 공지 상세를 열면 웹이 부릅니다. 그 사람이 이 공지의
 * 알림 대상(발송 행이 있음)이었을 때만 처음 한 번 `opened_at`을 적고, 아니면 아무것도 바꾸지 않습니다. 없는 공지는 404.
 */
export async function recordOpened(db: Database, userId: string, noticeId: string) {
  const row = await repo.findNotice(db, noticeId);
  if (!row) throw new AppError(404, "NOT_FOUND");
  await repo.markDeliveryOpened(db, row.id, userId);
}

export async function getAudience(
  db: Database,
  userId: string,
  buildingId: string,
): Promise<NoticeAudience> {
  const building = await buildingService.requireBuilding(db, buildingId);
  await requireManager(db, userId, building.id);
  return repo.countAudience(db, building.id);
}

/** 한 번에 보내는 푸시 수(동시 연결 상한). */
const PUSH_CONCURRENCY = 10;
/** 404·410이 아닌 실패가 이만큼 이어지면 그 구독을 지웁니다. */
const PUSH_FAILURE_LIMIT = 3;
/** 사용자마다 두는 브라우저 구독 수. 넘으면 오래된 것부터 지웁니다. */
const PUSH_SUBSCRIPTIONS_PER_USER = 5;
/** 구독 저장 반복 제한: 사용자마다 10분에 10번. */
const PUSH_SUBSCRIBE_LIMIT = { limit: 10, windowSeconds: 10 * 60 };

/**
 * 공지를 올립니다. 한 트랜잭션에서 `notices`와 알림 대상(발송 시점에 active이고 푸시 구독이 있는 거주자)의
 * `notice_deliveries`를 만들고 응답합니다. 푸시가 설정돼 있으면 `attemptedCount`는 만든 발송 행 수(알림 대상 수)이고,
 * 실제 발송은 응답 뒤 `tasks`에서 합니다(`sendNoticePush`). 발송이 실패해도 공지는 올라간 상태입니다.
 */
export async function createNotice(
  db: Database,
  push: PushSender,
  tasks: TaskRunner,
  userId: string,
  buildingId: string,
  input: CreateNoticeBody,
): Promise<CreateNoticeResult> {
  const building = await buildingService.requireBuilding(db, buildingId);
  await requireManager(db, userId, building.id);
  const endsAt = new Date(input.endsAt);
  if (endsAt.getTime() <= Date.now()) {
    throw new AppError(400, "VALIDATION_FAILED", { endsAt: "endsAt must be in the future" });
  }
  const { notice, deliveries } = await db.transaction(async (tx) => {
    const row = await repo.insertNotice(tx, {
      buildingId: building.id,
      title: input.title,
      body: input.body,
      startsAt: new Date(input.startsAt),
      endsAt,
      authorUserId: userId,
    });
    if (!row) throw new Error("notice insert returned no row");
    return { notice: row, deliveries: await repo.insertDeliveries(tx, row.id, building.id) };
  });
  let attemptedCount = 0;
  try {
    if (deliveries.length > 0 && (await push.isConfigured())) {
      attemptedCount = deliveries.length;
      tasks.run("notice_push", () => sendNoticePush(db, push, notice));
    }
  } catch (error) {
    log("error", "notice_push_failed", {
      noticeId: notice.id,
      name: error instanceof Error ? error.name : "unknown",
    });
  }
  return { notice: repo.toNotice(notice), attemptedCount };
}

async function sendSafely(push: PushSender, target: repo.DeliveryTarget, payload: string) {
  try {
    return await push.send(target, payload);
  } catch {
    return "failed" satisfies PushResult;
  }
}

/** 한 구독에 보내고 결과대로 구독을 정리합니다: 404·410이면 지우고, 실패가 3번 이어지면 지웁니다. */
async function deliverOne(
  db: Database,
  push: PushSender,
  target: repo.DeliveryTarget,
  payload: string,
) {
  await repo.markDeliveryAttempted(db, target.deliveryId);
  const result = await sendSafely(push, target, payload);
  if (result === "sent") await repo.resetPushFailures(db, target.endpoint);
  else if (result === "gone") await repo.deletePushSubscriptions(db, [target.endpoint]);
  else await repo.recordPushFailure(db, target.endpoint, PUSH_FAILURE_LIMIT);
}

/**
 * 응답 뒤에 도는 공지 푸시 발송(`tasks`). 대상의 브라우저 구독마다 최대 10개씩 동시에 보내고, 그 대상에게 처음
 * 보내기 시작할 때 `attempted_at`을 적습니다. 구독 하나의 실패는 다른 구독에 영향을 주지 않습니다.
 */
export async function sendNoticePush(db: Database, push: PushSender, notice: repo.NoticeRow) {
  const targets = await repo.listDeliveryTargets(db, notice.id);
  const payload: NoticePushPayload = {
    type: "notice",
    noticeId: notice.id,
    buildingId: notice.buildingId,
    title: notice.title,
    url: `/b/${notice.buildingId}/notices/${notice.id}`,
  };
  const body = JSON.stringify(payload);
  let next = 0;
  const worker = async () => {
    for (let target = targets[next++]; target; target = targets[next++]) {
      try {
        await deliverOne(db, push, target, body);
      } catch (error) {
        log("error", "notice_push_failed", {
          noticeId: notice.id,
          name: error instanceof Error ? error.name : "unknown",
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PUSH_CONCURRENCY, targets.length) }, worker));
}

/** 브라우저 구독에 쓰는 VAPID 공개키. 발송할 수 없는 환경이면 null(웹은 ‘지원 안 됨’으로 봅니다). */
export async function getPushPublicKey(env: Env, push: PushSender): Promise<PushPublicKey> {
  const publicKey =
    env.VAPID_PUBLIC_KEY && (await push.isConfigured()) ? env.VAPID_PUBLIC_KEY : null;
  return { publicKey };
}

/**
 * 공지 알림 구독은 active 거주자만 합니다(screens.md §1). 사용자마다 10분에 10번까지(429 `RATE_LIMITED`)이고,
 * 저장과 함께 최근에 저장한 5개만 남깁니다(한 트랜잭션).
 */
export async function subscribe(db: Database, userId: string, input: PushSubscriptionBody) {
  await requireOccupancy(db, userId, null, { allow: ["active"] });
  await hitRateLimit(db, "push_subscribe", userId, PUSH_SUBSCRIBE_LIMIT);
  await db.transaction(async (tx) => {
    await repo.upsertPushSubscription(tx, {
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    });
    await repo.trimUserPushSubscriptions(tx, userId, PUSH_SUBSCRIPTIONS_PER_USER);
  });
}

/** 이 계정의 모든 브라우저 구독을 지웁니다(다른 건물로 연결을 옮길 때, 연결 트랜잭션 안에서). */
export function deleteAllSubscriptions(db: Database, userId: string) {
  return repo.deleteAllUserPushSubscriptions(db, userId);
}

/** 내 구독만 지웁니다. 없어도 성공입니다. 연결이 끝난 뒤에도 지울 수 있습니다. */
export function unsubscribe(db: Database, userId: string, endpoint: string) {
  return repo.deleteUserPushSubscription(db, userId, endpoint);
}
