import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { pushSubscriptions } from "../../db/schema.ts";
import type { PushResult, PushSender, PushTarget } from "../../lib/push.ts";
import {
  addManager,
  createBuilding,
  createGuide,
  createManagedBuilding,
  createOccupancy,
  createPushSubscription,
  createUser,
  jsonRequest,
  sessionCookie,
  useTestApp,
} from "../../test/helpers.ts";

// 집주인 새 수정 메모·제보 알림(landlord web push). 공지 알림(push.test.ts)과 같은 구독 행을 쓰고
// `manager_alerts`를 켠 구독에만 보냅니다.
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

const keys = { p256dh: "browser-p256dh", auth: "browser-auth" };
const newEndpoint = () => `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`;

function enableManagerAlerts(endpoint: string, cookie: string) {
  return t.app.request(
    "/api/manage/push-subscriptions",
    jsonRequest("POST", { endpoint, keys }, cookie),
  );
}

function disableManagerAlerts(endpoint: string, cookie: string) {
  return t.app.request(
    "/api/manage/push-subscriptions",
    jsonRequest("DELETE", { endpoint }, cookie),
  );
}

async function resident(buildingId: string) {
  const userId = await createUser(t.db);
  await createOccupancy(t.db, buildingId, userId, "active");
  return { userId, cookie: await sessionCookie(t.db, userId) };
}

function writeMemo(guideId: string, cookie: string) {
  return t.app.request(
    `/api/guides/${guideId}/correction-memos`,
    jsonRequest("POST", { body: "수거 요일이 화요일로 바뀌었어요" }, cookie),
  );
}

function sendReport(buildingId: string, cookie?: string) {
  return t.app.request(
    `/api/buildings/${buildingId}/reports`,
    jsonRequest("POST", { source: "preset", preset: "trash_overflow" }, cookie),
  );
}

function sentTo() {
  return fake.sent.map((item) => item.target.endpoint).sort();
}

describe("landlord alert subscription", () => {
  it("saves this browser with manager alerts for a building manager", async () => {
    // Given
    const { managerId, managerCookie } = await createManagedBuilding(t.db, "open");
    const endpoint = newEndpoint();
    // When
    const response = await enableManagerAlerts(endpoint, managerCookie);
    // Then
    expect(response.status).toBe(204);
    const [row] = await t.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
    expect(row).toMatchObject({ userId: managerId, managerAlerts: true });
  });

  it("refuses people who manage no building and signed-out requests", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    const a = await resident(building.id);
    // When
    const asResident = await enableManagerAlerts(newEndpoint(), a.cookie);
    const anonymous = await t.app.request(
      "/api/manage/push-subscriptions",
      jsonRequest("POST", { endpoint: newEndpoint(), keys }),
    );
    // Then
    expect(asResident.status).toBe(403);
    expect(await asResident.json()).toEqual({ error: { code: "NOT_BUILDING_MANAGER" } });
    expect(anonymous.status).toBe(401);
  });

  it("keeps manager alerts when the same account saves the browser again for notices", async () => {
    // Given: a landlord who also lives in another building turns on both alerts on one phone
    const { managerId, managerCookie } = await createManagedBuilding(t.db, "open");
    await createOccupancy(t.db, (await createBuilding(t.db, "open")).id, managerId, "active");
    const endpoint = newEndpoint();
    await enableManagerAlerts(endpoint, managerCookie);
    // When
    await t.app.request(
      "/api/push-subscriptions",
      jsonRequest("POST", { endpoint, keys }, managerCookie),
    );
    // Then
    const [row] = await t.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
    expect(row?.managerAlerts).toBe(true);
  });

  it("does not carry manager alerts over when another account takes the browser", async () => {
    // Given
    const { managerCookie } = await createManagedBuilding(t.db, "open");
    const endpoint = newEndpoint();
    await enableManagerAlerts(endpoint, managerCookie);
    const other = await resident((await createBuilding(t.db, "open")).id);
    // When
    await t.app.request(
      "/api/push-subscriptions",
      jsonRequest("POST", { endpoint, keys }, other.cookie),
    );
    // Then
    const [row] = await t.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
    expect(row).toMatchObject({ userId: other.userId, managerAlerts: false });
  });
});

describe("new memo and report alerts", () => {
  it("sends one push to each manager browser with alerts on when a memo is written", async () => {
    // Given: two managers (one without alerts), a subscribed resident, and a manager of another building
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const guide = await createGuide(t.db, building.id, { status: "published" });
    const phone = newEndpoint();
    await enableManagerAlerts(phone, managerCookie);
    const coManager = await createUser(t.db);
    await addManager(t.db, building.id, coManager);
    await createPushSubscription(t.db, coManager); // 공지용 행(메모·제보 알림은 꺼짐)
    const writer = await resident(building.id);
    await createPushSubscription(t.db, writer.userId);
    const elsewhere = await createManagedBuilding(t.db, "open");
    await enableManagerAlerts(newEndpoint(), elsewhere.managerCookie);
    // When
    const response = await writeMemo(guide.id, writer.cookie);
    await t.tasks.idle();
    // Then
    expect(response.status).toBe(201);
    const memo = await response.json();
    expect(sentTo()).toEqual([phone]);
    expect(JSON.parse(fake.sent[0]?.payload ?? "{}")).toEqual({
      type: "memo",
      buildingId: building.id,
      title: "새 수정 메모가 왔어요",
      body: guide.title,
      url: `/manage/${building.id}/memos/${memo.id}`,
    });
  });

  it("sends a report alert to managers only, without the report text", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const phone = newEndpoint();
    await enableManagerAlerts(phone, managerCookie);
    const neighbour = await resident(building.id);
    await createPushSubscription(t.db, neighbour.userId);
    // When: a guest and a resident each send one report
    const asGuest = await sendReport(building.id);
    await t.tasks.idle();
    const guestSent = fake.sent.length;
    const asResident = await sendReport(building.id, neighbour.cookie);
    await t.tasks.idle();
    // Then
    expect(asGuest.status).toBe(201);
    expect(asResident.status).toBe(201);
    expect(guestSent).toBe(1);
    expect(sentTo()).toEqual([phone, phone]);
    const report = (await asGuest.json()).report;
    expect(JSON.parse(fake.sent[0]?.payload ?? "{}")).toEqual({
      type: "report",
      buildingId: building.id,
      title: "새 제보가 왔어요",
      body: building.name,
      url: `/manage/${building.id}/reports/${report.id}`,
    });
  });

  it("does not send a push when the request is refused", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const guide = await createGuide(t.db, building.id, { status: "published" });
    await enableManagerAlerts(newEndpoint(), managerCookie);
    // When: the landlord cannot write a memo or report on their own building
    const memo = await writeMemo(guide.id, managerCookie);
    const report = await sendReport(building.id, managerCookie);
    await t.tasks.idle();
    // Then
    expect(memo.status).toBe(403);
    expect(report.status).toBe(403);
    expect(fake.sent).toEqual([]);
  });

  it("stops sending after the landlord turns alerts off on this browser", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const phone = newEndpoint();
    await enableManagerAlerts(phone, managerCookie);
    // When
    const off = await disableManagerAlerts(phone, managerCookie);
    await sendReport(building.id);
    await t.tasks.idle();
    // Then: the landlord is not a resident, so the browser row is removed
    expect(off.status).toBe(204);
    expect(fake.sent).toEqual([]);
    expect(
      await t.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, phone)),
    ).toEqual([]);
  });

  it("keeps the notice subscription of a landlord who is also a resident", async () => {
    // Given
    const { building, managerId, managerCookie } = await createManagedBuilding(t.db, "open");
    await createOccupancy(t.db, (await createBuilding(t.db, "open")).id, managerId, "active");
    const phone = newEndpoint();
    await enableManagerAlerts(phone, managerCookie);
    // When
    await disableManagerAlerts(phone, managerCookie);
    await sendReport(building.id);
    await t.tasks.idle();
    // Then
    expect(fake.sent).toEqual([]);
    const [row] = await t.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, phone));
    expect(row?.managerAlerts).toBe(false);
  });

  it("removes a gone subscription and skips sending when push is not configured", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const phone = newEndpoint();
    await enableManagerAlerts(phone, managerCookie);
    fake.configured = false;
    // When
    await sendReport(building.id);
    await t.tasks.idle();
    // Then
    expect(fake.sent).toEqual([]);
    // When: the push service says the browser is gone
    fake.configured = true;
    fake.results.set(phone, "gone");
    await sendReport(building.id, (await resident(building.id)).cookie);
    await t.tasks.idle();
    // Then
    expect(sentTo()).toEqual([phone]);
    expect(
      await t.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, phone)),
    ).toEqual([]);
  });
});
