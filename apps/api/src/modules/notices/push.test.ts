import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { noticeDeliveries, notices, pushSubscriptions } from "../../db/schema.ts";
import type { PushResult, PushSender, PushTarget } from "../../lib/push.ts";
import {
  createBuilding,
  createManagedBuilding,
  createOccupancy,
  createPushSubscription,
  createUser,
  jsonRequest,
  sessionCookie,
  useTestApp,
} from "../../test/helpers.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 실제 푸시 서비스 대신 보낸 내용을 모으고, endpoint별로 정한 결과를 돌려주는 발송기. */
const fake = {
  configured: true,
  results: new Map<string, PushResult>(),
  sent: [] as { target: PushTarget; payload: string }[],
};
const fakePush: PushSender = {
  isConfigured: async () => fake.configured,
  send: async (target, payload) => {
    fake.sent.push({ target, payload });
    return fake.results.get(target.endpoint) ?? "sent";
  },
};

const t = useTestApp(
  {
    VAPID_PUBLIC_KEY: "test-vapid-public-key",
    VAPID_PRIVATE_KEY: "test-vapid-private-key",
    VAPID_SUBJECT: "mailto:team@example.invalid",
  },
  { push: fakePush },
);

beforeEach(() => {
  fake.configured = true;
  fake.results.clear();
  fake.sent = [];
});

function noticeBody(overrides: object = {}) {
  return {
    title: "9월 30일 단수",
    body: "오전 9시부터 12시까지 물이 나오지 않아요",
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 2 * DAY_MS).toISOString(),
    ...overrides,
  };
}

async function resident(buildingId: string, status: "active" | "reconfirm_needed" | "inactive") {
  const userId = await createUser(t.db);
  const occupancy = await createOccupancy(t.db, buildingId, userId, status);
  return { userId, occupancy, cookie: await sessionCookie(t.db, userId) };
}

describe("posting a notice", () => {
  it("targets active residents with a subscription and records each attempt after commit", async () => {
    // Given: two subscribed active residents (one with two browsers), and people who are not targets
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id, "active");
    const aPhone = await createPushSubscription(t.db, a.userId);
    const aLaptop = await createPushSubscription(t.db, a.userId);
    const b = await resident(building.id, "active");
    const bPhone = await createPushSubscription(t.db, b.userId);
    await resident(building.id, "active"); // 알림을 켜지 않음
    const moved = await resident(building.id, "inactive");
    await createPushSubscription(t.db, moved.userId);
    const paused = await resident(building.id, "reconfirm_needed");
    await createPushSubscription(t.db, paused.userId);
    const neighbour = await resident((await createBuilding(t.db, "open")).id, "active");
    await createPushSubscription(t.db, neighbour.userId);
    fake.results.set(aLaptop, "gone");
    fake.results.set(bPhone, "failed");

    // When
    const response = await t.app.request(
      `/api/buildings/${building.id}/notices`,
      jsonRequest("POST", noticeBody(), managerCookie),
    );

    // Then: attemptedCount counts the notified people (not arrivals); sending runs after the response
    expect(response.status).toBe(201);
    const body = await response.json();
    await t.tasks.idle();
    expect(body).toMatchObject({
      notice: { buildingId: building.id, title: "9월 30일 단수" },
      attemptedCount: 2,
    });
    const deliveries = await t.db
      .select()
      .from(noticeDeliveries)
      .where(eq(noticeDeliveries.noticeId, body.notice.id));
    expect(deliveries.map((row) => row.occupancyId).sort()).toEqual(
      [a.occupancy.id, b.occupancy.id].sort(),
    );
    expect(deliveries.every((row) => row.attemptedAt !== null && row.openedAt === null)).toBe(true);
    expect(fake.sent.map((item) => item.target.endpoint).sort()).toEqual(
      [aPhone, aLaptop, bPhone].sort(),
    );
    expect(JSON.parse(fake.sent[0]?.payload ?? "{}")).toEqual({
      type: "notice",
      noticeId: body.notice.id,
      buildingId: building.id,
      title: "9월 30일 단수",
      url: `/b/${building.id}/notices/${body.notice.id}`,
    });

    // Then: the gone subscription is removed, the failed one is kept
    const endpoints = (await t.db.select().from(pushSubscriptions)).map((row) => row.endpoint);
    expect(endpoints).not.toContain(aLaptop);
    expect(endpoints).toContain(aPhone);
    expect(endpoints).toContain(bPhone);
  });

  it("keeps delivery rows unattempted when push is not configured", async () => {
    // Given
    fake.configured = false;
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id, "active");
    await createPushSubscription(t.db, a.userId);
    // When
    const response = await t.app.request(
      `/api/buildings/${building.id}/notices`,
      jsonRequest("POST", noticeBody(), managerCookie),
    );
    // Then
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.attemptedCount).toBe(0);
    const deliveries = await t.db
      .select()
      .from(noticeDeliveries)
      .where(eq(noticeDeliveries.noticeId, body.notice.id));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.attemptedAt).toBeNull();
    expect(fake.sent).toEqual([]);
  });

  it("refuses non-managers and validates the period", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id, "active");
    const url = `/api/buildings/${building.id}/notices`;
    // When
    const asResident = await t.app.request(url, jsonRequest("POST", noticeBody(), a.cookie));
    const anonymous = await t.app.request(url, jsonRequest("POST", noticeBody()));
    const reversed = await t.app.request(
      url,
      jsonRequest(
        "POST",
        noticeBody({ endsAt: new Date(Date.now() - 2 * DAY_MS).toISOString() }),
        managerCookie,
      ),
    );
    const alreadyEnded = await t.app.request(
      url,
      jsonRequest(
        "POST",
        noticeBody({
          startsAt: new Date(Date.now() - 3 * DAY_MS).toISOString(),
          endsAt: new Date(Date.now() - DAY_MS).toISOString(),
        }),
        managerCookie,
      ),
    );
    // Then
    expect(asResident.status).toBe(403);
    expect(await asResident.json()).toEqual({ error: { code: "NOT_BUILDING_MANAGER" } });
    expect(anonymous.status).toBe(401);
    expect(reversed.status).toBe(400);
    expect(await reversed.json()).toMatchObject({
      error: { fields: { endsAt: expect.any(String) } },
    });
    expect(alreadyEnded.status).toBe(400);
    expect(await t.db.select().from(notices).where(eq(notices.buildingId, building.id))).toEqual(
      [],
    );
  });

  it("shows the manager how many residents are connected and how many get alerts", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id, "active");
    await createPushSubscription(t.db, a.userId);
    await resident(building.id, "active");
    await resident(building.id, "inactive");
    // When
    const response = await t.app.request(
      `/api/buildings/${building.id}/notices/audience`,
      jsonRequest("GET", undefined, managerCookie),
    );
    const asResident = await t.app.request(
      `/api/buildings/${building.id}/notices/audience`,
      jsonRequest("GET", undefined, a.cookie),
    );
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connectedCount: 2, pushTargetCount: 1 });
    expect(asResident.status).toBe(403);
  });
});

describe("background sending and subscription upkeep", () => {
  function postNotice(buildingId: string, cookie: string) {
    return t.app.request(
      `/api/buildings/${buildingId}/notices`,
      jsonRequest("POST", noticeBody(), cookie),
    );
  }

  it("answers before the push is sent and records attempted_at when sending starts", async () => {
    // Given: the push service will not answer until released
    let release = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = fakePush.send;
    fakePush.send = async (target, payload) => {
      await blocked;
      return original(target, payload);
    };
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id, "active");
    await createPushSubscription(t.db, a.userId);
    try {
      // When
      const response = await postNotice(building.id, managerCookie);
      const body = await response.json();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const [whileSending] = await t.db
        .select()
        .from(noticeDeliveries)
        .where(eq(noticeDeliveries.noticeId, body.notice.id));
      release();
      await t.tasks.idle();
      // Then
      expect(response.status).toBe(201);
      expect(body.attemptedCount).toBe(1);
      expect(whileSending?.attemptedAt).toBeInstanceOf(Date);
      expect(fake.sent).toHaveLength(1);
    } finally {
      fakePush.send = original;
    }
  });

  it("drops a subscription after three failures in a row, and a success resets the count", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id, "active");
    const flaky = await createPushSubscription(t.db, a.userId);
    const row = async () =>
      (await t.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, flaky)))[0];
    // When: fail, fail, succeed, then fail three times
    const counts = [];
    for (const result of ["failed", "failed", "sent", "failed", "failed"] as const) {
      fake.results.set(flaky, result);
      await postNotice(building.id, managerCookie);
      await t.tasks.idle();
      counts.push((await row())?.failureCount);
    }
    fake.results.set(flaky, "failed");
    await postNotice(building.id, managerCookie);
    await t.tasks.idle();
    // Then
    expect(counts).toEqual([1, 2, 0, 1, 2]);
    expect(await row()).toBeUndefined();
  });

  it("keeps only the five most recently saved browsers per account", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const a = await resident(building.id, "active");
    const keys = { p256dh: "browser-p256dh", auth: "browser-auth" };
    const endpoints = Array.from(
      { length: 6 },
      (_, i) => `https://fcm.googleapis.com/fcm/send/cap-${i}-${crypto.randomUUID()}`,
    );
    // When
    for (const endpoint of endpoints) {
      await t.app.request(
        "/api/push-subscriptions",
        jsonRequest("POST", { endpoint, keys }, a.cookie),
      );
    }
    // Then
    const rows = await t.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, a.userId));
    expect(rows.map((item) => item.endpoint).sort()).toEqual(endpoints.slice(1).sort());
  });

  it("limits saving subscriptions to ten per ten minutes", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const a = await resident(building.id, "active");
    const keys = { p256dh: "browser-p256dh", auth: "browser-auth" };
    const save = () =>
      t.app.request(
        "/api/push-subscriptions",
        jsonRequest(
          "POST",
          { endpoint: `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`, keys },
          a.cookie,
        ),
      );
    // When
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await save()).status);
    const last = await save();
    // Then
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(204));
    expect(statuses[10]).toBe(429);
    expect(await last.json()).toEqual({ error: { code: "RATE_LIMITED" } });
    expect(Number(last.headers.get("Retry-After"))).toBeGreaterThan(500);
  });
});

describe("POST /notices/:noticeId/opened", () => {
  it("records the first open for a notified resident only", async () => {
    // Given: A was a push target, B connected without push
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id, "active");
    await createPushSubscription(t.db, a.userId);
    const b = await resident(building.id, "active");
    const posted = await (
      await t.app.request(
        `/api/buildings/${building.id}/notices`,
        jsonRequest("POST", noticeBody(), managerCookie),
      )
    ).json();
    const opened = (cookie?: string, noticeId = posted.notice.id) =>
      t.app.request(`/api/notices/${noticeId}/opened`, jsonRequest("POST", {}, cookie));
    const delivery = async () =>
      (
        await t.db
          .select()
          .from(noticeDeliveries)
          .where(eq(noticeDeliveries.noticeId, posted.notice.id))
      )[0];
    // When
    const first = await opened(a.cookie);
    const firstOpenedAt = (await delivery())?.openedAt;
    const again = await opened(a.cookie);
    const byB = await opened(b.cookie);
    const anonymous = await opened();
    const unknown = await opened(a.cookie, crypto.randomUUID());
    // Then
    expect(first.status).toBe(204);
    expect(firstOpenedAt).toBeInstanceOf(Date);
    expect(again.status).toBe(204);
    expect((await delivery())?.openedAt).toEqual(firstOpenedAt);
    expect(byB.status).toBe(204);
    expect(
      await t.db
        .select()
        .from(noticeDeliveries)
        .where(eq(noticeDeliveries.noticeId, posted.notice.id)),
    ).toHaveLength(1);
    expect(anonymous.status).toBe(401);
    expect(unknown.status).toBe(404);
  });
});

describe("push subscriptions", () => {
  const subscription = () => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`,
    keys: { p256dh: "browser-p256dh", auth: "browser-auth" },
  });

  it("returns the VAPID public key when push can be sent", async () => {
    // When
    const response = await t.app.request("/api/push-subscriptions/public-key");
    // Then
    expect(await response.json()).toEqual({ publicKey: "test-vapid-public-key" });
  });

  it("lets an active resident subscribe and unsubscribe the same browser", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const a = await resident(building.id, "active");
    const body = subscription();
    // When
    const saved = await t.app.request(
      "/api/push-subscriptions",
      jsonRequest("POST", body, a.cookie),
    );
    const savedAgain = await t.app.request(
      "/api/push-subscriptions",
      jsonRequest("POST", body, a.cookie),
    );
    const rows = await t.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, body.endpoint));
    const removed = await t.app.request(
      "/api/push-subscriptions",
      jsonRequest("DELETE", { endpoint: body.endpoint }, a.cookie),
    );
    // Then
    expect(saved.status).toBe(204);
    expect(savedAgain.status).toBe(204);
    expect(rows).toEqual([expect.objectContaining({ userId: a.userId, p256dh: "browser-p256dh" })]);
    expect(removed.status).toBe(204);
    expect(
      await t.db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, body.endpoint)),
    ).toEqual([]);
  });

  it("refuses residents who are not connected or need to reconfirm", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const stranger = await sessionCookie(t.db, await createUser(t.db));
    const moved = await resident(building.id, "inactive");
    const paused = await resident(building.id, "reconfirm_needed");
    // When
    const asStranger = await t.app.request(
      "/api/push-subscriptions",
      jsonRequest("POST", subscription(), stranger),
    );
    const asMoved = await t.app.request(
      "/api/push-subscriptions",
      jsonRequest("POST", subscription(), moved.cookie),
    );
    const asPaused = await t.app.request(
      "/api/push-subscriptions",
      jsonRequest("POST", subscription(), paused.cookie),
    );
    const anonymous = await t.app.request(
      "/api/push-subscriptions",
      jsonRequest("POST", subscription()),
    );
    // Then
    expect(asStranger.status).toBe(403);
    expect(await asStranger.json()).toEqual({ error: { code: "NOT_CONNECTED" } });
    expect(asMoved.status).toBe(403);
    expect(await asMoved.json()).toEqual({ error: { code: "NOT_CONNECTED" } });
    expect(asPaused.status).toBe(403);
    expect(await asPaused.json()).toEqual({ error: { code: "RECONFIRM_NEEDED" } });
    expect(anonymous.status).toBe(401);
  });

  it("accepts only known push services as endpoints", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const a = await resident(building.id, "active");
    const keys = { p256dh: "browser-p256dh", auth: "browser-auth" };
    const save = (endpoint: string) =>
      t.app.request("/api/push-subscriptions", jsonRequest("POST", { endpoint, keys }, a.cookie));
    const id = crypto.randomUUID();
    // When
    const allowed = [
      `https://fcm.googleapis.com/fcm/send/${id}`,
      `https://updates.push.services.mozilla.com/wpush/v2/${id}`,
      `https://web.push.apple.com/${id}`,
      `https://wns2-by3p.notify.windows.com/w/?token=${id}`,
    ];
    const refused = [
      "https://127.0.0.1/push",
      "https://[::1]/push",
      "https://localhost/push",
      "https://169.254.169.254/latest/meta-data",
      "https://evil.example/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.example/x",
      "https://push.apple.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://user:pw@fcm.googleapis.com/x",
      "http://fcm.googleapis.com/x",
    ];
    const allowedStatuses = await Promise.all(allowed.map(async (url) => (await save(url)).status));
    const refusedStatuses = await Promise.all(refused.map(async (url) => (await save(url)).status));
    // Then
    expect(allowedStatuses).toEqual(allowed.map(() => 204));
    expect(refusedStatuses).toEqual(refused.map(() => 400));
  });

  it("moves a browser's subscription to another account only with the same auth secret", async () => {
    // Given: A subscribed this browser; B knows the endpoint but not the browser's auth secret
    const building = await createBuilding(t.db, "open");
    const a = await resident(building.id, "active");
    const b = await resident(building.id, "active");
    const body = subscription();
    await t.app.request("/api/push-subscriptions", jsonRequest("POST", body, a.cookie));
    // When
    const hijack = await t.app.request(
      "/api/push-subscriptions",
      jsonRequest("POST", { ...body, keys: { p256dh: "attacker", auth: "attacker" } }, b.cookie),
    );
    const afterHijack = await t.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, body.endpoint));
    const sameBrowser = await t.app.request(
      "/api/push-subscriptions",
      jsonRequest("POST", body, b.cookie),
    );
    const afterSwitch = await t.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, body.endpoint));
    // Then
    expect(hijack.status).toBe(204);
    expect(afterHijack).toEqual([
      expect.objectContaining({ userId: a.userId, p256dh: "browser-p256dh", auth: "browser-auth" }),
    ]);
    expect(sameBrowser.status).toBe(204);
    expect(afterSwitch).toEqual([expect.objectContaining({ userId: b.userId })]);
  });

  it("does not let one account delete another account's subscription", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const a = await resident(building.id, "active");
    const endpoint = await createPushSubscription(t.db, a.userId);
    const other = await sessionCookie(t.db, await createUser(t.db));
    // When
    const response = await t.app.request(
      "/api/push-subscriptions",
      jsonRequest("DELETE", { endpoint }, other),
    );
    // Then
    expect(response.status).toBe(204);
    expect(
      await t.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)),
    ).toHaveLength(1);
  });
});
