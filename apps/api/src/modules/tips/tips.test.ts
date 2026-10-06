import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { contentReports, moderationActions, tips } from "../../db/schema.ts";
import {
  createBuilding,
  createManagedBuilding,
  createOccupancy,
  createTip,
  createUser,
  jsonRequest,
  sessionCookie,
  TEST_ORIGIN,
  useTestApp,
  withCookie,
} from "../../test/helpers.ts";
import { createdMonth } from "./repo.ts";
import * as tipService from "./service.ts";

const t = useTestApp();
const DAY_MS = 24 * 60 * 60 * 1000;

type Who = "active" | "requested" | "overdue" | "paused" | "moved";

/** 이 건물과 관계가 있는 사용자. requested: 재확인 요청 중(14일 안), overdue: 요청 뒤 14일이 지남. */
async function resident(buildingId: string, who: Who = "active") {
  const userId = await createUser(t.db);
  const status = who === "paused" ? "reconfirm_needed" : who === "moved" ? "inactive" : "active";
  const nextReconfirmAt =
    who === "requested"
      ? new Date(Date.now() - DAY_MS)
      : who === "overdue"
        ? new Date(Date.now() - 15 * DAY_MS)
        : undefined;
  await createOccupancy(
    t.db,
    buildingId,
    userId,
    status,
    nextReconfirmAt ? { nextReconfirmAt } : {},
  );
  return { userId, cookie: await sessionCookie(t.db, userId) };
}

async function stranger() {
  const userId = await createUser(t.db);
  return { userId, cookie: await sessionCookie(t.db, userId) };
}

async function codeOf(response: Response) {
  return response.status < 300
    ? response.status
    : `${response.status} ${(await response.json()).error.code}`;
}

async function codes(results: Record<string, Response>) {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(results).map(async ([who, response]) => [who, await codeOf(response)]),
    ),
  );
}

function listTips(buildingId: string, cookie?: string) {
  return t.app.request(
    `/api/buildings/${buildingId}/tips`,
    cookie ? withCookie(cookie) : { headers: { Origin: TEST_ORIGIN } },
  );
}

function writeTip(buildingId: string, body: unknown, cookie?: string) {
  return t.app.request(`/api/buildings/${buildingId}/tips`, jsonRequest("POST", body, cookie));
}

function reportTip(tipId: string, cookie?: string, body: unknown = {}) {
  return t.app.request(`/api/tips/${tipId}/content-reports`, jsonRequest("POST", body, cookie));
}

describe("GET /buildings/:buildingId/tips", () => {
  it("shows residents the visible tips newest first, with month only and mine on their own", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id);
    const b = await resident(building.id);
    const older = await createTip(t.db, building.id, b.userId, {
      createdAt: new Date("2025-12-10T09:00:00+09:00"),
    });
    const mine = await createTip(t.db, building.id, a.userId, { category: "recycling" });
    await createTip(t.db, building.id, b.userId, { hidden: true });
    await createTip(t.db, (await createBuilding(t.db, "open")).id, b.userId);
    // When
    const response = await listTips(building.id, a.cookie);
    // Then
    expect(response.status).toBe(200);
    const { tips: list } = await response.json();
    expect(list).toEqual([
      {
        id: mine.id,
        buildingId: building.id,
        category: "recycling",
        body: mine.body,
        createdMonth: createdMonth(new Date()),
        mine: true,
      },
      expect.objectContaining({ id: older.id, createdMonth: "2025-12", mine: false }),
    ]);
    expect(JSON.stringify(list)).not.toContain(a.userId);
    expect(JSON.stringify(list)).not.toContain(b.userId);
    expect(JSON.stringify(list)).not.toContain("createdAt");
  });

  it("uses the Seoul month for tips written late at night UTC", async () => {
    // Then: 2026-09-30 15:30 UTC는 서울 기준 10월 1일 00:30
    expect(createdMonth(new Date("2026-09-30T15:30:00Z"))).toBe("2026-10");
    expect(createdMonth(new Date("2026-09-30T14:59:00Z"))).toBe("2026-09");
  });

  it("lets residents (even paused) and the landlord read, and nobody else", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    await createTip(t.db, building.id, null);
    const neighbour = await resident((await createBuilding(t.db, "open")).id);
    // When
    const results = {
      active: await listTips(building.id, (await resident(building.id)).cookie),
      paused: await listTips(building.id, (await resident(building.id, "paused")).cookie),
      overdue: await listTips(building.id, (await resident(building.id, "overdue")).cookie),
      landlord: await listTips(building.id, managerCookie),
      anonymous: await listTips(building.id),
      stranger: await listTips(building.id, (await stranger()).cookie),
      neighbour: await listTips(building.id, neighbour.cookie),
      moved: await listTips(building.id, (await resident(building.id, "moved")).cookie),
      unknown: await listTips(crypto.randomUUID(), managerCookie),
    };
    // Then
    expect(await codes(results)).toEqual({
      active: 200,
      paused: 200,
      overdue: 200,
      landlord: 200,
      anonymous: "401 UNAUTHENTICATED",
      stranger: "403 NOT_CONNECTED",
      neighbour: "403 NOT_CONNECTED",
      moved: "403 NOT_CONNECTED",
      unknown: "404 NOT_FOUND",
    });
  });
});

describe("POST /buildings/:buildingId/tips", () => {
  it("lets an active resident leave a tip and stores the author internally", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id);
    // When
    const response = await writeTip(
      building.id,
      { category: "winter", body: "  겨울엔 뒤편 분리수거함 쪽이 어두워요  " },
      a.cookie,
    );
    // Then
    expect(response.status).toBe(201);
    const tip = await response.json();
    expect(tip).toEqual({
      id: expect.any(String),
      buildingId: building.id,
      category: "winter",
      body: "겨울엔 뒤편 분리수거함 쪽이 어두워요",
      createdMonth: createdMonth(new Date()),
      mine: true,
    });
    const [stored] = await t.db.select().from(tips).where(eq(tips.id, tip.id));
    expect(stored?.authorUserId).toBe(a.userId);
  });

  it("keeps line breaks in a tip but refuses other control characters", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id);
    // When
    const multiline = await writeTip(
      building.id,
      { category: "other", body: "첫 줄\n둘째 줄" },
      a.cookie,
    );
    const escapeSequence = await writeTip(
      building.id,
      { category: "other", body: "\u001b[31m빨강" },
      a.cookie,
    );
    const bell = await writeTip(building.id, { category: "other", body: "소리\u0007" }, a.cookie);
    const c1 = await writeTip(building.id, { category: "other", body: "다음\u0085줄" }, a.cookie);
    // Then
    expect(multiline.status).toBe(201);
    expect((await multiline.json()).body).toBe("첫 줄\n둘째 줄");
    for (const response of [escapeSequence, bell, c1]) {
      expect(await codeOf(response)).toBe("400 VALIDATION_FAILED");
    }
  });

  it("validates kind and length", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id);
    // When
    const blank = await writeTip(building.id, { category: "other", body: "  " }, a.cookie);
    const long = await writeTip(
      building.id,
      { category: "other", body: "가".repeat(201) },
      a.cookie,
    );
    const longest = await writeTip(
      building.id,
      { category: "other", body: "가".repeat(200) },
      a.cookie,
    );
    const badKind = await writeTip(building.id, { category: "facility", body: "설비" }, a.cookie);
    // Then
    expect(await codeOf(blank)).toBe("400 VALIDATION_FAILED");
    expect(await codeOf(long)).toBe("400 VALIDATION_FAILED");
    expect(longest.status).toBe(201);
    expect(await codeOf(badKind)).toBe("400 VALIDATION_FAILED");
  });

  it("refuses everyone but active residents of this building", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const neighbour = await resident((await createBuilding(t.db, "open")).id);
    const body = { category: "parcel", body: "택배는 선반 위에" };
    // When
    const results = {
      anonymous: await writeTip(building.id, body),
      stranger: await writeTip(building.id, body, (await stranger()).cookie),
      neighbour: await writeTip(building.id, body, neighbour.cookie),
      moved: await writeTip(building.id, body, (await resident(building.id, "moved")).cookie),
      paused: await writeTip(building.id, body, (await resident(building.id, "paused")).cookie),
      overdue: await writeTip(building.id, body, (await resident(building.id, "overdue")).cookie),
      landlord: await writeTip(building.id, body, managerCookie),
      // 재확인 요청 중이어도 14일 동안은 그대로 쓸 수 있습니다.
      requested: await writeTip(
        building.id,
        body,
        (await resident(building.id, "requested")).cookie,
      ),
    };
    // Then
    expect(await codes(results)).toEqual({
      anonymous: "401 UNAUTHENTICATED",
      stranger: "403 NOT_CONNECTED",
      neighbour: "403 NOT_CONNECTED",
      moved: "403 NOT_CONNECTED",
      paused: "403 RECONFIRM_NEEDED",
      overdue: "403 RECONFIRM_NEEDED",
      landlord: "403 FORBIDDEN",
      requested: 201,
    });
    expect(await t.db.select().from(tips).where(eq(tips.buildingId, building.id))).toHaveLength(1);
  });
});

describe("own tip edit and delete", () => {
  function patchTip(tipId: string, body: unknown, cookie?: string) {
    return t.app.request(`/api/tips/${tipId}`, jsonRequest("PATCH", body, cookie));
  }
  function deleteTip(tipId: string, cookie?: string) {
    return t.app.request(`/api/tips/${tipId}`, {
      method: "DELETE",
      headers: { Origin: TEST_ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
    });
  }

  it("lets the author edit and delete while connected, even when a reconfirm is due", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id, "overdue");
    const tip = await createTip(t.db, building.id, a.userId);
    // When
    const edited = await patchTip(tip.id, { body: "택배는 계단 옆 선반으로 옮겨졌어요" }, a.cookie);
    const empty = await patchTip(tip.id, {}, a.cookie);
    const deleted = await deleteTip(tip.id, a.cookie);
    const again = await deleteTip(tip.id, a.cookie);
    const editDeleted = await patchTip(tip.id, { body: "지운 뒤" }, a.cookie);
    const list = await (await listTips(building.id, a.cookie)).json();
    // Then
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({
      id: tip.id,
      category: "parcel",
      body: "택배는 계단 옆 선반으로 옮겨졌어요",
      mine: true,
    });
    expect(await codeOf(empty)).toBe("400 VALIDATION_FAILED");
    expect(deleted.status).toBe(204);
    expect(await codeOf(again)).toBe("404 NOT_FOUND");
    expect(await codeOf(editDeleted)).toBe("404 NOT_FOUND");
    expect(list.tips.map((item: { id: string }) => item.id)).not.toContain(tip.id);
    // 행은 남고(신고·운영 기록 보존) deleted_at만 채워집니다.
    const [stored] = await t.db.select().from(tips).where(eq(tips.id, tip.id));
    expect(stored?.deletedAt).toBeInstanceOf(Date);
  });

  it("locks editing a hidden tip or one with an open report, but keeps delete and the reported text", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id);
    const reported = await createTip(t.db, building.id, a.userId, { body: "원래 내용" });
    const hidden = await createTip(t.db, building.id, a.userId, { hidden: true });
    const reporter = await resident(building.id);
    await reportTip(reported.id, reporter.cookie, { reason: "특정인 이야기" });
    // When
    const editReported = await patchTip(reported.id, { body: "흔적을 지운 내용" }, a.cookie);
    const editHidden = await patchTip(hidden.id, { body: "가린 뒤 고침" }, a.cookie);
    const deleteReported = await deleteTip(reported.id, a.cookie);
    // Then
    expect(await codeOf(editReported)).toBe("409 CONFLICT");
    expect(await codeOf(editHidden)).toBe("409 CONFLICT");
    expect(deleteReported.status).toBe(204);
    const [report] = await t.db
      .select()
      .from(contentReports)
      .where(eq(contentReports.tipId, reported.id));
    expect(report).toMatchObject({ tipBody: "원래 내용", status: "open" });
    const queued = await tipService.listTipsForModeration(t.db);
    expect(queued.find((item) => item.tip.id === reported.id)?.tip.deletedAt).toBeInstanceOf(Date);
  });

  it("hides others' tips behind 404 and stops authors who moved out", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const moved = await resident(building.id, "moved");
    const movedTip = await createTip(t.db, building.id, moved.userId);
    const a = await resident(building.id);
    const aTip = await createTip(t.db, building.id, a.userId);
    const other = await resident(building.id);
    const patch = { body: "고친 내용" };
    // When
    const results = {
      movedEdit: await patchTip(movedTip.id, patch, moved.cookie),
      movedDelete: await deleteTip(movedTip.id, moved.cookie),
      otherEdit: await patchTip(aTip.id, patch, other.cookie),
      otherDelete: await deleteTip(aTip.id, other.cookie),
      landlordEdit: await patchTip(aTip.id, patch, managerCookie),
      anonymous: await patchTip(aTip.id, patch),
      unknown: await patchTip(crypto.randomUUID(), patch, a.cookie),
    };
    // Then
    expect(await codes(results)).toEqual({
      movedEdit: "403 NOT_CONNECTED",
      movedDelete: "403 NOT_CONNECTED",
      otherEdit: "404 NOT_FOUND",
      otherDelete: "404 NOT_FOUND",
      landlordEdit: "404 NOT_FOUND",
      anonymous: "401 UNAUTHENTICATED",
      unknown: "404 NOT_FOUND",
    });
    const stored = await t.db.select().from(tips).where(eq(tips.buildingId, building.id));
    expect(stored.map((row) => row.body).sort()).toEqual([aTip.body, movedTip.body].sort());
  });
});

describe("POST /tips/:tipId/content-reports", () => {
  it("records one report per person and tip, from residents and the landlord", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const author = await resident(building.id);
    const tip = await createTip(t.db, building.id, author.userId);
    const a = await resident(building.id);
    const paused = await resident(building.id, "paused");
    // When
    const first = await reportTip(tip.id, a.cookie, { reason: " 특정인을 짐작할 수 있어요 " });
    const again = await reportTip(tip.id, a.cookie, { reason: "다시" });
    const byLandlord = await reportTip(tip.id, managerCookie);
    const byPaused = await reportTip(tip.id, paused.cookie, { reason: "" });
    // Then
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ alreadyReported: false });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ alreadyReported: true });
    expect(byLandlord.status).toBe(201);
    expect(byPaused.status).toBe(201);
    const stored = await t.db.select().from(contentReports).where(eq(contentReports.tipId, tip.id));
    expect(stored).toHaveLength(3);
    expect(stored.find((row) => row.reporterUserId === a.userId)).toMatchObject({
      reason: "특정인을 짐작할 수 있어요",
      status: "open",
    });
    expect(stored.find((row) => row.reporterUserId === paused.userId)?.reason).toBeNull();
  });

  it("refuses the author, outsiders, hidden or deleted tips and bad reasons", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const author = await resident(building.id);
    const tip = await createTip(t.db, building.id, author.userId);
    const hidden = await createTip(t.db, building.id, null, { hidden: true });
    const deleted = await createTip(t.db, building.id, null);
    await t.db.update(tips).set({ deletedAt: new Date() }).where(eq(tips.id, deleted.id));
    const a = await resident(building.id);
    // When
    const results = {
      author: await reportTip(tip.id, author.cookie),
      moved: await reportTip(tip.id, (await resident(building.id, "moved")).cookie),
      stranger: await reportTip(tip.id, (await stranger()).cookie),
      anonymous: await reportTip(tip.id),
      hidden: await reportTip(hidden.id, a.cookie),
      deleted: await reportTip(deleted.id, a.cookie),
      unknown: await reportTip(crypto.randomUUID(), a.cookie),
      longReason: await reportTip(tip.id, a.cookie, { reason: "가".repeat(201) }),
      controlReason: await reportTip(tip.id, a.cookie, { reason: "사유\u001b[2J" }),
      twoLineReason: await reportTip(tip.id, a.cookie, { reason: "첫 줄\n둘째 줄" }),
    };
    // Then
    expect(await codes(results)).toEqual({
      author: "403 FORBIDDEN",
      moved: "403 NOT_CONNECTED",
      stranger: "403 NOT_CONNECTED",
      anonymous: "401 UNAUTHENTICATED",
      hidden: "404 NOT_FOUND",
      deleted: "404 NOT_FOUND",
      unknown: "404 NOT_FOUND",
      longReason: "400 VALIDATION_FAILED",
      controlReason: "400 VALIDATION_FAILED",
      twoLineReason: "400 VALIDATION_FAILED",
    });
  });
});

describe("GET /me/tips and the manage summary", () => {
  it("lists my tips everywhere, marking hidden ones and only current-building tips as editable", async () => {
    // Given: A left a tip at an old building, moved, then left tips at the current one
    const old = await createBuilding(t.db, "open");
    const { building } = await createManagedBuilding(t.db, "open");
    const userId = await createUser(t.db);
    await createOccupancy(t.db, old.id, userId, "inactive");
    await createOccupancy(t.db, building.id, userId);
    const cookie = await sessionCookie(t.db, userId);
    const oldTip = await createTip(t.db, old.id, userId, {
      createdAt: new Date(Date.now() - DAY_MS),
    });
    const hiddenTip = await createTip(t.db, building.id, userId, { hidden: true });
    await createTip(t.db, building.id, await createUser(t.db));
    // When
    const response = await t.app.request("/api/me/tips", withCookie(cookie));
    const anonymous = await t.app.request("/api/me/tips");
    // Then
    expect(response.status).toBe(200);
    expect((await response.json()).tips).toEqual([
      expect.objectContaining({
        id: hiddenTip.id,
        buildingName: building.name,
        mine: true,
        hidden: true,
        editable: true,
      }),
      expect.objectContaining({ id: oldTip.id, hidden: false, editable: false }),
    ]);
    expect(await codeOf(anonymous)).toBe("401 UNAUTHENTICATED");
  });

  it("counts visible tips on the landlord's building", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    await createTip(t.db, building.id, null);
    await createTip(t.db, building.id, null);
    await createTip(t.db, building.id, null, { hidden: true });
    // When
    const response = await t.app.request("/api/manage/buildings", withCookie(managerCookie));
    // Then
    expect((await response.json()).buildings).toEqual([
      expect.objectContaining({ id: building.id, tipCount: 2, newReportCount: 0 }),
    ]);
  });
});

describe("operator moderation (LF-19)", () => {
  it("hides a reported tip from lists, marks its reports reviewed, and restores it", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const a = await resident(building.id);
    const tip = await createTip(t.db, building.id, null);
    await reportTip(tip.id, a.cookie, { reason: "특정인 이야기" });
    const queued = await tipService.listTipsForModeration(t.db);
    // When
    const hidden = await tipService.hideTip(t.db, tip.id, "특정인을 짐작할 수 있음", "운영자A");
    const whileHidden = await (await listTips(building.id, a.cookie)).json();
    const reviewed = await t.db
      .select()
      .from(contentReports)
      .where(eq(contentReports.tipId, tip.id));
    const restored = await tipService.restoreTip(t.db, tip.id, "운영자B");
    const afterRestore = await (await listTips(building.id, a.cookie)).json();
    const missing = await tipService.hideTip(t.db, crypto.randomUUID(), null, "운영자A");
    const history = await t.db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.tipId, tip.id))
      .orderBy(asc(moderationActions.createdAt));
    // Then
    expect(queued.find((item) => item.tip.id === tip.id)?.reports).toEqual([
      expect.objectContaining({ reason: "특정인 이야기", status: "open" }),
    ]);
    expect(hidden).toMatchObject({ hiddenReason: "특정인을 짐작할 수 있음" });
    expect(hidden?.hiddenAt).toBeInstanceOf(Date);
    expect(whileHidden.tips.map((item: { id: string }) => item.id)).not.toContain(tip.id);
    expect(reviewed.map((row) => row.status)).toEqual(["reviewed"]);
    expect(restored).toMatchObject({ hiddenAt: null, hiddenReason: null });
    expect(afterRestore.tips.map((item: { id: string }) => item.id)).toContain(tip.id);
    expect(missing).toBeUndefined();
    // 가림·복원 기록은 둘 다 남습니다(복원해도 지우지 않음).
    expect(history.map((row) => [row.action, row.operator, row.reason])).toEqual([
      ["hide", "운영자A", "특정인을 짐작할 수 있음"],
      ["restore", "운영자B", null],
    ]);
  });
});
