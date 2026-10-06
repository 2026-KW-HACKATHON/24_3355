import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../lib/auth.ts";
import { occupancyState } from "../lib/reconfirm.ts";
import { DEMO_RESET_BUCKETS } from "../modules/demo/service.ts";
import {
  addManager,
  createGuide,
  createInvite,
  createManagedBuilding,
  createMemo,
  createOccupancy,
  createReport,
  createTip,
  createUser,
  jsonRequest,
  sessionCookie,
  setJoinCode,
  useTestApp,
} from "../test/helpers.ts";
import {
  DEMO_BUILDING_ID,
  DEMO_E2E_BUILDING_ID,
  DEMO_E2E_LANDLORD_KAKAO_ID,
  DEMO_E2E_PREPARING_BUILDING_ID,
  DEMO_GUEST_REPORT_ID,
  DEMO_GUEST_REPORT_TOKEN,
  DEMO_JOIN_CODE,
  DEMO_LANDLORD_KAKAO_ID,
  DEMO_MEMO_IDS,
  DEMO_PREPARING_BUILDING_ID,
  DEMO_RESIDENT_A_KAKAO_ID,
  DEMO_TIP_IDS,
  resetDemo,
  seedDemo,
} from "./demo.ts";
import {
  buildingManagers,
  buildings,
  contentReports,
  correctionMemos,
  guideRevisions,
  guides,
  joinCodes,
  managerInvites,
  occupancies,
  rateLimits,
  reportAccessTokens,
  reports,
  tips,
  users,
} from "./schema.ts";

/**
 * 시연 행을 지우고 다시 만드는 테스트(초기화 API 포함)는 이 파일에 모읍니다. 파일끼리 병렬로 돌 때 다른 파일의
 * 초기화가 이 파일의 Given을 지우지 않도록, 초기화는 한 파일 안에서 차례로 돕니다.
 */
const t = useTestApp();
/** 초기화의 같은 사람 제한을 보려고 X-Forwarded-For의 마지막 값을 클라이언트 주소로 씁니다. */
const demo = useTestApp({ DEMO_MODE: "true", TRUSTED_PROXY_HOPS: "1" });

describe("demo reset", () => {
  it("restores 새봄하우스 to preparing with no guides and leaves other buildings untouched", async () => {
    // Given: a demo run opened 새봄하우스, and an unrelated building exists
    await seedDemo(t.db);
    const demoManagerId = await createUser(t.db);
    await addManager(t.db, DEMO_PREPARING_BUILDING_ID, demoManagerId);
    await createInvite(t.db, DEMO_PREPARING_BUILDING_ID);
    await createGuide(t.db, DEMO_PREPARING_BUILDING_ID, { status: "published" });
    await t.db
      .update(buildings)
      .set({ status: "open", openedAt: new Date() })
      .where(eq(buildings.id, DEMO_PREPARING_BUILDING_ID));
    const extraDraft = await createGuide(t.db, DEMO_BUILDING_ID, { status: "draft", position: 9 });
    const other = await createManagedBuilding(t.db, "open");
    const otherGuide = await createGuide(t.db, other.building.id, { status: "published" });

    // When
    const summary = await resetDemo(t.db);

    // Then: 새봄하우스 is back to a fresh preparing building
    const [preparing] = await t.db
      .select()
      .from(buildings)
      .where(eq(buildings.id, DEMO_PREPARING_BUILDING_ID));
    expect(preparing).toMatchObject({ name: "새봄하우스", status: "preparing", openedAt: null });
    expect(
      await t.db.select().from(guides).where(eq(guides.buildingId, DEMO_PREPARING_BUILDING_ID)),
    ).toEqual([]);
    expect(
      await t.db
        .select()
        .from(buildingManagers)
        .where(eq(buildingManagers.buildingId, DEMO_PREPARING_BUILDING_ID)),
    ).toEqual([]);
    expect(
      await t.db
        .select()
        .from(managerInvites)
        .where(eq(managerInvites.buildingId, DEMO_PREPARING_BUILDING_ID)),
    ).toEqual([]);
    expect(summary.find((building) => building.id === DEMO_PREPARING_BUILDING_ID)).toMatchObject({
      guides: 1,
      managers: 1,
      invites: 1,
    });

    // Then: 햇살빌라 has exactly its seeded published guides again
    const sunny = await t.db
      .select()
      .from(guides)
      .where(and(eq(guides.buildingId, DEMO_BUILDING_ID), eq(guides.status, "published")));
    expect(sunny).toHaveLength(4);
    expect(await t.db.select().from(guides).where(eq(guides.id, extraDraft.id))).toEqual([]);

    // Then: the unrelated building, its guide and its manager are untouched
    const [otherBuilding] = await t.db
      .select()
      .from(buildings)
      .where(eq(buildings.id, other.building.id));
    expect(otherBuilding?.status).toBe("open");
    expect(await t.db.select().from(guides).where(eq(guides.id, otherGuide.id))).toHaveLength(1);
    expect(
      await t.db
        .select()
        .from(buildingManagers)
        .where(eq(buildingManagers.buildingId, other.building.id)),
    ).toHaveLength(1);
  });
});

describe("demo join code and residents", () => {
  async function residentAId() {
    const [row] = await t.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.kakaoUserId, DEMO_RESIDENT_A_KAKAO_ID));
    if (!row) throw new Error("demo resident A missing");
    return row.id;
  }

  it("restores the demo code and resident A, and drops people who connected during the demo", async () => {
    // Given: during the demo the landlord changed the code and resident B connected
    await seedDemo(t.db);
    await t.db
      .update(joinCodes)
      .set({ retiredAt: new Date() })
      .where(and(eq(joinCodes.buildingId, DEMO_BUILDING_ID), isNull(joinCodes.retiredAt)));
    await setJoinCode(t.db, DEMO_BUILDING_ID, "ZZ9999");
    const visitor = await createUser(t.db);
    await createOccupancy(t.db, DEMO_BUILDING_ID, visitor);

    // When
    await resetDemo(t.db);

    // Then
    const current = await t.db
      .select()
      .from(joinCodes)
      .where(and(eq(joinCodes.buildingId, DEMO_BUILDING_ID), isNull(joinCodes.retiredAt)));
    expect(current.map((row) => row.code)).toEqual([DEMO_JOIN_CODE]);
    const live = await t.db
      .select()
      .from(occupancies)
      .where(and(eq(occupancies.buildingId, DEMO_BUILDING_ID), ne(occupancies.status, "inactive")));
    expect(live.map((row) => row.userId)).toEqual([await residentAId()]);
  });

  it("brings resident A back to 햇살빌라 on re-seed after a demo move", async () => {
    // Given: resident A moved to another building during the demo
    await seedDemo(t.db);
    const residentA = await residentAId();
    await t.db
      .update(occupancies)
      .set({ status: "inactive", endedAt: new Date() })
      .where(eq(occupancies.userId, residentA));
    const other = await createManagedBuilding(t.db, "open");
    await createOccupancy(t.db, other.building.id, residentA);

    // When
    await seedDemo(t.db);

    // Then
    const live = await t.db
      .select()
      .from(occupancies)
      .where(and(eq(occupancies.userId, residentA), ne(occupancies.status, "inactive")));
    expect(live.map((row) => row.buildingId)).toEqual([DEMO_BUILDING_ID]);
  });
});

describe("demo memos and reconfirm", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  async function residentA() {
    const [row] = await t.db
      .select({ occupancy: occupancies })
      .from(occupancies)
      .innerJoin(users, eq(users.id, occupancies.userId))
      .where(
        and(eq(users.kakaoUserId, DEMO_RESIDENT_A_KAKAO_ID), ne(occupancies.status, "inactive")),
      );
    if (!row) throw new Error("demo resident A has no live occupancy");
    return row.occupancy;
  }

  function seededMemos() {
    return t.db.select().from(correctionMemos).where(inArray(correctionMemos.id, DEMO_MEMO_IDS));
  }

  it("seeds pending memos on 햇살빌라 and puts them back after a demo decided one", async () => {
    // Given: during the demo the landlord kept a memo and saved an unpublished edit, and someone left a memo
    await seedDemo(t.db);
    const [first] = await seededMemos();
    if (!first) throw new Error("seeded memo missing");
    await t.db
      .update(correctionMemos)
      .set({ status: "kept", keptReason: "그대로예요", resolvedAt: new Date() })
      .where(eq(correctionMemos.id, first.id));
    await t.db.insert(guideRevisions).values({
      guideId: first.guideId,
      category: "recycling",
      title: "시연 중 저장한 수정본",
      body: "본문",
    });
    const visitorMemo = await createMemo(t.db, first.guideId, await createUser(t.db));

    // When
    await seedDemo(t.db);

    // Then: seeded memos are pending again (one by resident A), the edit is gone, the visitor memo stays
    const memos = await seededMemos();
    expect(memos.map((memo) => memo.status)).toEqual(["pending", "pending"]);
    const a = await residentA();
    expect(memos.filter((memo) => memo.authorUserId === a.userId)).toHaveLength(1);
    const [memoGuide] = await t.db.select().from(guides).where(eq(guides.id, first.guideId));
    expect(memoGuide?.buildingId).toBe(DEMO_BUILDING_ID);
    expect(
      await t.db.select().from(guideRevisions).where(eq(guideRevisions.guideId, first.guideId)),
    ).toEqual([]);
    expect(
      await t.db.select().from(correctionMemos).where(eq(correctionMemos.id, visitorMemo.id)),
    ).toHaveLength(1);
  });

  it("can put resident A into a pending reconfirm request, and a plain re-seed clears it", async () => {
    // When
    await resetDemo(t.db, { reconfirmRequested: true });
    const requested = await residentA();
    const memosAfterReset = await t.db
      .select({ id: correctionMemos.id })
      .from(correctionMemos)
      .innerJoin(guides, eq(guides.id, correctionMemos.guideId))
      .where(eq(guides.buildingId, DEMO_BUILDING_ID));
    await seedDemo(t.db);
    const cleared = await residentA();

    // Then: requested a day ago, still active with 13 days to answer
    expect(occupancyState(requested)).toMatchObject({ status: "active", reconfirmRequested: true });
    expect(requested.lastReconfirmedAt).toBeNull();
    expect(requested.nextReconfirmAt.getTime()).toBeLessThan(Date.now());
    expect(requested.nextReconfirmAt.getTime()).toBeGreaterThan(Date.now() - 2 * DAY_MS);
    expect(memosAfterReset.map((memo) => memo.id).sort()).toEqual([...DEMO_MEMO_IDS].sort());
    expect(occupancyState(cleared)).toMatchObject({ status: "active", reconfirmRequested: false });
    expect(cleared.nextReconfirmAt.getTime()).toBeGreaterThan(Date.now() + 364 * DAY_MS);
  });
});

describe("e2e building", () => {
  async function managedBy(kakaoUserId: string) {
    const rows = await t.db
      .select({ buildingId: buildingManagers.buildingId })
      .from(buildingManagers)
      .innerJoin(users, eq(users.id, buildingManagers.userId))
      .where(eq(users.kakaoUserId, kakaoUserId));
    return rows.map((row) => row.buildingId);
  }

  it("seeds 테스트빌라 managed only by the e2e landlord, apart from 햇살빌라", async () => {
    // When
    await seedDemo(t.db);
    // Then
    const [building] = await t.db
      .select()
      .from(buildings)
      .where(eq(buildings.id, DEMO_E2E_BUILDING_ID));
    expect(building).toMatchObject({ name: "테스트빌라", status: "open" });
    const published = await t.db
      .select()
      .from(guides)
      .where(and(eq(guides.buildingId, DEMO_E2E_BUILDING_ID), eq(guides.status, "published")));
    expect(published.map((guide) => guide.category).sort()).toEqual(["parcel", "recycling"]);
    expect(await managedBy(DEMO_E2E_LANDLORD_KAKAO_ID)).toEqual([DEMO_E2E_BUILDING_ID]);
    expect(await managedBy(DEMO_LANDLORD_KAKAO_ID)).not.toContain(DEMO_E2E_BUILDING_ID);
  });

  it("puts 테스트빌라 back on reset, dropping guides and edits made by e2e runs", async () => {
    // Given: an e2e run added a draft and a published guide, and renamed the building
    await seedDemo(t.db);
    const draft = await createGuide(t.db, DEMO_E2E_BUILDING_ID, { status: "draft", position: 3 });
    const extra = await createGuide(t.db, DEMO_E2E_BUILDING_ID, {
      status: "published",
      position: 4,
    });
    await t.db
      .update(buildings)
      .set({ name: "e2e가 바꾼 이름" })
      .where(eq(buildings.id, DEMO_E2E_BUILDING_ID));

    // When
    const summary = await resetDemo(t.db);

    // Then
    const rows = await t.db
      .select()
      .from(guides)
      .where(eq(guides.buildingId, DEMO_E2E_BUILDING_ID));
    expect(rows.map((guide) => guide.id)).not.toContain(draft.id);
    expect(rows.map((guide) => guide.id)).not.toContain(extra.id);
    expect(rows).toHaveLength(2);
    const [building] = await t.db
      .select()
      .from(buildings)
      .where(eq(buildings.id, DEMO_E2E_BUILDING_ID));
    expect(building?.name).toBe("테스트빌라");
    expect(summary.find((item) => item.id === DEMO_E2E_BUILDING_ID)).toMatchObject({
      name: "테스트빌라",
      managers: 1,
    });
    expect(await managedBy(DEMO_E2E_LANDLORD_KAKAO_ID)).toEqual([DEMO_E2E_BUILDING_ID]);
  });
});

describe("demo tips", () => {
  async function residentAId() {
    const [row] = await t.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.kakaoUserId, DEMO_RESIDENT_A_KAKAO_ID));
    if (!row) throw new Error("demo resident A missing");
    return row.id;
  }

  function seededTips() {
    return t.db.select().from(tips).where(inArray(tips.id, DEMO_TIP_IDS));
  }

  it("seeds visible tips on 햇살빌라 with one by resident A", async () => {
    // When
    await seedDemo(t.db);
    // Then
    const rows = await seededTips();
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.buildingId === DEMO_BUILDING_ID && row.hiddenAt === null)).toBe(
      true,
    );
    const a = await residentAId();
    expect(rows.filter((row) => row.authorUserId === a)).toHaveLength(1);
    expect(rows.filter((row) => row.authorUserId === null)).toHaveLength(3);
  });

  it("puts seeded tips back on re-seed and drops demo tips and reports only on reset", async () => {
    // Given: during the demo a seeded tip was edited, reported and hidden, and a visitor left a tip and a report
    await seedDemo(t.db);
    const [first] = await seededTips();
    if (!first) throw new Error("seeded tip missing");
    await t.db
      .update(tips)
      .set({
        body: "시연 중 고친 팁",
        hiddenAt: new Date(),
        hiddenReason: "시연",
        deletedAt: new Date(),
      })
      .where(eq(tips.id, first.id));
    const reporter = await createUser(t.db);
    await t.db.insert(contentReports).values({ tipId: first.id, reporterUserId: reporter });
    const visitorTip = await createTip(t.db, DEMO_BUILDING_ID, await createUser(t.db));
    const visitorReport = await createReport(t.db, DEMO_BUILDING_ID);

    // When
    await seedDemo(t.db);

    // Then: the seeded tip is back and unreported, visitor rows stay
    const [restored] = await t.db.select().from(tips).where(eq(tips.id, first.id));
    expect(restored).toMatchObject({
      body: first.body,
      hiddenAt: null,
      hiddenReason: null,
      deletedAt: null,
    });
    expect(
      await t.db.select().from(contentReports).where(eq(contentReports.tipId, first.id)),
    ).toEqual([]);
    expect(await t.db.select().from(tips).where(eq(tips.id, visitorTip.id))).toHaveLength(1);

    // When
    const summary = await resetDemo(t.db);

    // Then: reset removes what the demo added and recreates the seeded tips
    expect(await t.db.select().from(tips).where(eq(tips.id, visitorTip.id))).toEqual([]);
    expect(await t.db.select().from(reports).where(eq(reports.id, visitorReport.id))).toEqual([]);
    expect(await seededTips()).toHaveLength(4);
    expect(summary.find((item) => item.id === DEMO_BUILDING_ID)).toMatchObject({
      tips: 5,
      reports: expect.any(Number),
    });
  });
});

describe("e2e preparing building (준비빌라)", () => {
  async function state() {
    const [building] = await t.db
      .select()
      .from(buildings)
      .where(eq(buildings.id, DEMO_E2E_PREPARING_BUILDING_ID));
    const count = async (table: typeof guides | typeof buildingManagers | typeof joinCodes) =>
      (await t.db.select().from(table).where(eq(table.buildingId, DEMO_E2E_PREPARING_BUILDING_ID)))
        .length;
    return {
      building: building && {
        name: building.name,
        status: building.status,
        openedAt: building.openedAt,
        confirmedAt: building.confirmedAt,
      },
      guides: await count(guides),
      managers: await count(buildingManagers),
      joinCodes: await count(joinCodes),
      invites: (
        await t.db
          .select()
          .from(managerInvites)
          .where(eq(managerInvites.buildingId, DEMO_E2E_PREPARING_BUILDING_ID))
      ).length,
    };
  }
  const fresh = {
    building: { name: "준비빌라", status: "preparing", openedAt: null, confirmedAt: null },
    guides: 0,
    managers: 0,
    joinCodes: 0,
    invites: 0,
  };

  it("exists as a preparing building without manager, guides or code, and re-seed leaves e2e changes", async () => {
    // Given
    await resetDemo(t.db);
    const before = await state();
    const landlord = await createUser(t.db);
    await createInvite(t.db, DEMO_E2E_PREPARING_BUILDING_ID);
    await addManager(t.db, DEMO_E2E_PREPARING_BUILDING_ID, landlord);
    // When
    await seedDemo(t.db);
    // Then: the seed never adds a manager, and does not undo what an e2e run did
    expect(before).toEqual(fresh);
    expect(await state()).toMatchObject({ managers: 1, invites: 1, guides: 0 });
  });

  it("goes back to exactly the fresh state on reset", async () => {
    // Given: an e2e run accepted an invite, published a guide (open) and made a join code
    await resetDemo(t.db);
    const landlord = await createUser(t.db);
    await createInvite(t.db, DEMO_E2E_PREPARING_BUILDING_ID);
    await addManager(t.db, DEMO_E2E_PREPARING_BUILDING_ID, landlord);
    await createGuide(t.db, DEMO_E2E_PREPARING_BUILDING_ID, { status: "published" });
    await setJoinCode(t.db, DEMO_E2E_PREPARING_BUILDING_ID, "ZZ2345");
    await t.db
      .update(buildings)
      .set({
        status: "open",
        openedAt: new Date(),
        confirmedAt: new Date(),
        name: "e2e가 바꾼 이름",
      })
      .where(eq(buildings.id, DEMO_E2E_PREPARING_BUILDING_ID));
    // When
    const summary = await resetDemo(t.db);
    // Then
    expect(await state()).toEqual(fresh);
    expect(summary.find((item) => item.id === DEMO_E2E_PREPARING_BUILDING_ID)).toMatchObject({
      name: "준비빌라",
      managers: 1,
      guides: 1,
      invites: 1,
      joinCodes: 1,
    });
  });
});

describe("demo building confirmation (LF-12·23)", () => {
  async function confirmedAt(id: string) {
    const [row] = await t.db
      .select({ confirmedAt: buildings.confirmedAt })
      .from(buildings)
      .where(eq(buildings.id, id));
    return row?.confirmedAt;
  }

  it("seeds 햇살빌라·테스트빌라 as confirmed and puts 새봄하우스·준비빌라 back to unconfirmed on reset", async () => {
    // Given: a demo confirmed 새봄하우스, and 햇살빌라 lost its confirmation somehow
    await seedDemo(t.db);
    await t.db
      .update(buildings)
      .set({ confirmedAt: new Date() })
      .where(eq(buildings.id, DEMO_PREPARING_BUILDING_ID));
    await t.db
      .update(buildings)
      .set({ confirmedAt: null })
      .where(eq(buildings.id, DEMO_BUILDING_ID));
    // When: a plain re-seed, then a reset
    await seedDemo(t.db);
    const afterSeed = {
      sunny: await confirmedAt(DEMO_BUILDING_ID),
      spring: await confirmedAt(DEMO_PREPARING_BUILDING_ID),
    };
    await resetDemo(t.db);
    // Then: re-seed restores 햇살빌라 and keeps the demo's confirmation; reset restores everything
    expect(afterSeed.sunny).toBeInstanceOf(Date);
    expect(afterSeed.spring).toBeInstanceOf(Date);
    expect(await confirmedAt(DEMO_BUILDING_ID)).toBeInstanceOf(Date);
    expect(await confirmedAt(DEMO_E2E_BUILDING_ID)).toBeInstanceOf(Date);
    expect(await confirmedAt(DEMO_PREPARING_BUILDING_ID)).toBeNull();
    expect(await confirmedAt(DEMO_E2E_PREPARING_BUILDING_ID)).toBeNull();
  });
});

describe("demo mode API (LF-20, 29)", () => {
  const CLIENT_A = "198.51.100.10";
  const CLIENT_B = "198.51.100.20";
  const CLIENT_C = "198.51.100.30";

  /** 초기화 제한은 모든 사람 합친 것도 있어서, 테스트마다 기록을 지우고 시작합니다. */
  function clearResetLimits(buckets: string[] = Object.values(DEMO_RESET_BUCKETS)) {
    return demo.db.delete(rateLimits).where(inArray(rateLimits.bucket, buckets));
  }

  /** `client`: 이 요청을 보낸 주소(X-Forwarded-For). 없으면 모든 테스트 요청이 같은 소켓 주소입니다. */
  function postReset(body: unknown = {}, cookie?: string, client?: string) {
    const init = jsonRequest("POST", body, cookie);
    if (client) init.headers = { ...init.headers, "X-Forwarded-For": client };
    return demo.app.request("/api/dev/reset", init);
  }

  /** 모든 사람 합친 30초 창·한 시간 창의 지금 횟수. */
  async function globalResetCounts() {
    const rows = await demo.db
      .select({ bucket: rateLimits.bucket, hitCount: rateLimits.hitCount })
      .from(rateLimits)
      .where(inArray(rateLimits.bucket, [DEMO_RESET_BUCKETS.interval, DEMO_RESET_BUCKETS.hourly]));
    const count = (bucket: string) => rows.find((row) => row.bucket === bucket)?.hitCount ?? 0;
    return {
      interval: count(DEMO_RESET_BUCKETS.interval),
      hourly: count(DEMO_RESET_BUCKETS.hourly),
    };
  }

  beforeEach(async () => {
    await clearResetLimits();
  });

  it("has no demo routes unless DEMO_MODE is on", async () => {
    // When
    const overview = await t.app.request("/api/dev/demo");
    const reset = await t.app.request("/api/dev/reset", jsonRequest("POST", {}));
    // Then
    expect(overview.status).toBe(404);
    expect(reset.status).toBe(404);
  });

  it("lists the demo buildings and role accounts with their current state, without login", async () => {
    // Given
    await resetDemo(demo.db, { guestReport: true });
    // When
    const response = await demo.app.request("/api/dev/demo");
    // Then
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.buildings).toEqual([
      expect.objectContaining({
        id: DEMO_BUILDING_ID,
        name: "햇살빌라",
        status: "open",
        confirmedAt: expect.any(String),
        purpose: "demo",
        joinCode: DEMO_JOIN_CODE,
      }),
      expect.objectContaining({
        id: DEMO_PREPARING_BUILDING_ID,
        status: "preparing",
        confirmedAt: null,
        purpose: "demo",
        joinCode: null,
      }),
      expect.objectContaining({
        id: DEMO_E2E_BUILDING_ID,
        confirmedAt: expect.any(String),
        purpose: "e2e",
      }),
      expect.objectContaining({
        id: DEMO_E2E_PREPARING_BUILDING_ID,
        confirmedAt: null,
        purpose: "e2e",
      }),
    ]);
    expect(body.accounts).toEqual([
      expect.objectContaining({
        as: "demo-resident-a",
        label: "입주자 A",
        role: "resident",
        purpose: "demo",
        occupancy: expect.objectContaining({ buildingId: DEMO_BUILDING_ID, status: "active" }),
        tipCount: 1,
        memoCount: 1,
      }),
      expect.objectContaining({
        as: "demo-landlord",
        role: "landlord",
        purpose: "demo",
        buildings: [{ id: DEMO_BUILDING_ID, name: "햇살빌라" }],
        pendingMemoCount: 2,
        newReportCount: 1,
      }),
      expect.objectContaining({
        as: "demo-resident-b",
        role: "resident",
        occupancy: null,
        tipCount: 0,
        memoCount: 0,
      }),
      expect.objectContaining({
        as: "demo-e2e-landlord",
        role: "landlord",
        purpose: "e2e",
        buildings: [{ id: DEMO_E2E_BUILDING_ID, name: "테스트빌라" }],
      }),
    ]);
    expect(body.guestReport).toEqual({
      reportId: DEMO_GUEST_REPORT_ID,
      statusPath: `/r/${DEMO_GUEST_REPORT_ID}#t=${DEMO_GUEST_REPORT_TOKEN}`,
    });
  });

  it("gives no guest report link when its token row is gone, until the next reset", async () => {
    // Given
    await resetDemo(demo.db, { guestReport: true });
    await demo.db
      .delete(reportAccessTokens)
      .where(eq(reportAccessTokens.reportId, DEMO_GUEST_REPORT_ID));
    // When
    const missing = await demo.app.request("/api/dev/demo");
    await resetDemo(demo.db, { guestReport: true });
    const restored = await demo.app.request("/api/dev/demo");
    // Then
    expect((await missing.json()).guestReport).toBeNull();
    expect((await restored.json()).guestReport).toMatchObject({ reportId: DEMO_GUEST_REPORT_ID });
  });

  it("resets only the two presentation buildings and leaves the e2e buildings and accounts alone", async () => {
    // Given: a demo opened 새봄하우스 and renamed 햇살빌라, e2e runs changed 테스트빌라·준비빌라,
    // and an unrelated building has data
    await resetDemo(demo.db, { guestReport: true });
    const demoManager = await createUser(demo.db);
    await addManager(demo.db, DEMO_PREPARING_BUILDING_ID, demoManager);
    await createGuide(demo.db, DEMO_PREPARING_BUILDING_ID, { status: "published" });
    await demo.db
      .update(buildings)
      .set({ status: "open", openedAt: new Date(), confirmedAt: new Date() })
      .where(eq(buildings.id, DEMO_PREPARING_BUILDING_ID));
    await demo.db
      .update(buildings)
      .set({ name: "시연 중 바꾼 이름" })
      .where(eq(buildings.id, DEMO_BUILDING_ID));
    const e2eManager = await createUser(demo.db);
    await addManager(demo.db, DEMO_E2E_PREPARING_BUILDING_ID, e2eManager);
    await demo.db
      .update(buildings)
      .set({ status: "open", openedAt: new Date(), confirmedAt: new Date() })
      .where(eq(buildings.id, DEMO_E2E_PREPARING_BUILDING_ID));
    const e2eGuide = await createGuide(demo.db, DEMO_E2E_BUILDING_ID, {
      status: "draft",
      position: 9,
    });
    const e2eBuildingsBefore = await demo.db
      .select()
      .from(buildings)
      .where(inArray(buildings.id, [DEMO_E2E_BUILDING_ID, DEMO_E2E_PREPARING_BUILDING_ID]));
    const [e2eLandlordBefore] = await demo.db
      .select()
      .from(users)
      .where(eq(users.kakaoUserId, DEMO_E2E_LANDLORD_KAKAO_ID));
    const other = await createManagedBuilding(demo.db, "open");
    await demo.db
      .update(buildings)
      .set({ confirmedAt: new Date() })
      .where(eq(buildings.id, other.building.id));
    const [otherBefore] = await demo.db
      .select()
      .from(buildings)
      .where(eq(buildings.id, other.building.id));
    const otherGuide = await createGuide(demo.db, other.building.id, { status: "published" });
    const otherReport = await createReport(demo.db, other.building.id);
    const otherTip = await createTip(demo.db, other.building.id, await createUser(demo.db));
    // When
    const response = await postReset();
    // Then: only the two presentation buildings are back to the seed
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.buildings.map((item: { id: string }) => item.id)).toEqual([
      DEMO_BUILDING_ID,
      DEMO_PREPARING_BUILDING_ID,
    ]);
    expect(
      body.buildings.find((item: { id: string }) => item.id === DEMO_PREPARING_BUILDING_ID),
    ).toEqual({
      id: DEMO_PREPARING_BUILDING_ID,
      name: "새봄하우스",
      removed: expect.objectContaining({ managers: 1, guides: 1 }),
    });
    const [sunny] = await demo.db
      .select()
      .from(buildings)
      .where(eq(buildings.id, DEMO_BUILDING_ID));
    expect(sunny?.name).toBe("햇살빌라");
    const [preparing] = await demo.db
      .select()
      .from(buildings)
      .where(eq(buildings.id, DEMO_PREPARING_BUILDING_ID));
    expect(preparing).toMatchObject({ status: "preparing", openedAt: null, confirmedAt: null });
    expect(
      await demo.db
        .select()
        .from(reportAccessTokens)
        .where(eq(reportAccessTokens.reportId, DEMO_GUEST_REPORT_ID)),
    ).toHaveLength(1);
    // Then: the e2e buildings, their rows and the e2e landlord are untouched
    expect(
      await demo.db
        .select()
        .from(buildings)
        .where(inArray(buildings.id, [DEMO_E2E_BUILDING_ID, DEMO_E2E_PREPARING_BUILDING_ID])),
    ).toEqual(expect.arrayContaining(e2eBuildingsBefore));
    expect(await demo.db.select().from(guides).where(eq(guides.id, e2eGuide.id))).toHaveLength(1);
    expect(
      await demo.db
        .select()
        .from(buildingManagers)
        .where(eq(buildingManagers.buildingId, DEMO_E2E_PREPARING_BUILDING_ID)),
    ).toHaveLength(1);
    const [e2eLandlordAfter] = await demo.db
      .select()
      .from(users)
      .where(eq(users.kakaoUserId, DEMO_E2E_LANDLORD_KAKAO_ID));
    expect(e2eLandlordAfter).toEqual(e2eLandlordBefore);
    // Then: the unrelated building and its rows are untouched
    const [otherAfter] = await demo.db
      .select()
      .from(buildings)
      .where(eq(buildings.id, other.building.id));
    expect(otherAfter).toEqual(otherBefore);
    expect(await demo.db.select().from(guides).where(eq(guides.id, otherGuide.id))).toHaveLength(1);
    expect(await demo.db.select().from(reports).where(eq(reports.id, otherReport.id))).toHaveLength(
      1,
    );
    expect(await demo.db.select().from(tips).where(eq(tips.id, otherTip.id))).toHaveLength(1);
    expect(
      await demo.db
        .select()
        .from(buildingManagers)
        .where(eq(buildingManagers.buildingId, other.building.id)),
    ).toHaveLength(1);
  });

  it("can put resident A into a pending reconfirm request", async () => {
    // When
    const response = await postReset({ reconfirmRequested: true });
    // Then
    expect(response.status).toBe(200);
    const [row] = await demo.db
      .select({ occupancy: occupancies })
      .from(occupancies)
      .innerJoin(users, eq(users.id, occupancies.userId))
      .where(
        and(eq(users.kakaoUserId, DEMO_RESIDENT_A_KAKAO_ID), ne(occupancies.status, "inactive")),
      );
    expect(row && occupancyState(row.occupancy)).toMatchObject({
      status: "active",
      reconfirmRequested: true,
    });
  });

  it("allows one reset per 30 seconds for everyone together and 20 per hour", async () => {
    // Given: a reset just happened, then a demo added a draft guide
    const first = await postReset({}, undefined, CLIENT_A);
    const guide = await createGuide(demo.db, DEMO_BUILDING_ID, { status: "draft", position: 9 });
    // When: someone else (another address, signed in this time) asks again right away
    const someoneElse = await sessionCookie(demo.db, await createUser(demo.db));
    const tooSoon = await postReset({}, someoneElse, CLIENT_B);
    // Then
    expect(first.status).toBe(200);
    expect(tooSoon.status).toBe(429);
    expect(await tooSoon.json()).toEqual({ error: { code: "RATE_LIMITED" } });
    const soonRetry = Number(tooSoon.headers.get("Retry-After"));
    expect(soonRetry).toBeGreaterThanOrEqual(1);
    expect(soonRetry).toBeLessThanOrEqual(30);
    expect(await demo.db.select().from(guides).where(eq(guides.id, guide.id))).toHaveLength(1);

    // Given: the 30-second windows have passed, but 20 resets were used this hour
    await clearResetLimits([DEMO_RESET_BUCKETS.interval, DEMO_RESET_BUCKETS.clientInterval]);
    await demo.db
      .update(rateLimits)
      .set({ hitCount: 20, windowStartedAt: sql`now() - interval '10 minutes'` })
      .where(eq(rateLimits.bucket, DEMO_RESET_BUCKETS.hourly));
    // When: a third address that has not reset yet
    const hourly = await postReset({}, undefined, CLIENT_C);
    // Then
    expect(hourly.status).toBe(429);
    const hourlyRetry = Number(hourly.headers.get("Retry-After"));
    expect(hourlyRetry).toBeGreaterThan(30);
    expect(hourlyRetry).toBeLessThanOrEqual(50 * 60);
    expect(await demo.db.select().from(guides).where(eq(guides.id, guide.id))).toHaveLength(1);
  });

  it("limits one address to one reset per 30 seconds and 10 per hour without using everyone's budget", async () => {
    // Given: address A reset once
    const first = await postReset({}, undefined, CLIENT_A);
    const guide = await createGuide(demo.db, DEMO_BUILDING_ID, { status: "draft", position: 9 });
    // When: A keeps asking right away, even after signing in as a demo account
    const again = await postReset({}, undefined, CLIENT_A);
    const signedIn = await postReset(
      {},
      await sessionCookie(demo.db, await createUser(demo.db)),
      CLIENT_A,
    );
    // Then: A is refused by its own limit and everyone's counts stay at the one real reset
    expect(first.status).toBe(200);
    expect(again.status).toBe(429);
    expect(signedIn.status).toBe(429);
    expect(await globalResetCounts()).toEqual({ interval: 1, hourly: 1 });
    expect(await demo.db.select().from(guides).where(eq(guides.id, guide.id))).toHaveLength(1);

    // Given: the 30-second windows have passed, but A already used 10 resets this hour
    await clearResetLimits([DEMO_RESET_BUCKETS.interval, DEMO_RESET_BUCKETS.clientInterval]);
    await demo.db
      .update(rateLimits)
      .set({ hitCount: 10, windowStartedAt: sql`now() - interval '10 minutes'` })
      .where(eq(rateLimits.bucket, DEMO_RESET_BUCKETS.clientHourly));
    // When
    const hourly = await postReset({}, undefined, CLIENT_A);
    const other = await postReset({}, undefined, CLIENT_B);
    // Then: A waits for its hour, B still resets, and A's refused tries did not count for everyone
    expect(hourly.status).toBe(429);
    expect(Number(hourly.headers.get("Retry-After"))).toBeGreaterThan(30);
    expect(other.status).toBe(200);
    expect(await globalResetCounts()).toEqual({ interval: 1, hourly: 2 });
    expect(await demo.db.select().from(guides).where(eq(guides.id, guide.id))).toEqual([]);
  });

  it("refuses cross-site form posts and invalid bodies without using the limit", async () => {
    // Given
    const guide = await createGuide(demo.db, DEMO_BUILDING_ID, { status: "draft", position: 9 });
    // When
    const crossSite = await demo.app.request("/api/dev/reset", {
      method: "POST",
      headers: { "Content-Type": "text/plain", Origin: "https://evil.example" },
      body: "{}",
    });
    const noOrigin = await demo.app.request("/api/dev/reset", { method: "POST" });
    const invalid = await postReset({ reconfirmRequested: "yes" });
    // Then
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toEqual({ error: { code: "FORBIDDEN" } });
    expect(noOrigin.status).toBe(403);
    expect(invalid.status).toBe(400);
    expect(await demo.db.select().from(guides).where(eq(guides.id, guide.id))).toHaveLength(1);
    expect(
      await demo.db
        .select()
        .from(rateLimits)
        .where(inArray(rateLimits.bucket, Object.values(DEMO_RESET_BUCKETS))),
    ).toEqual([]);
  });
});

describe("demo guest report (29 옆 건물 주민)", () => {
  function viewAsGuest(token = DEMO_GUEST_REPORT_TOKEN) {
    return t.app.request(`/api/reports/${DEMO_GUEST_REPORT_ID}`, {
      headers: { "X-Report-Token": token },
    });
  }

  async function guestReport() {
    const [row] = await t.db.select().from(reports).where(eq(reports.id, DEMO_GUEST_REPORT_ID));
    return row;
  }

  it("seeds a received guest report on 햇살빌라 that the demo token opens, storing only the token hash", async () => {
    // When
    await seedDemo(t.db, { guestReport: true });
    const response = await viewAsGuest();
    const wrong = await viewAsGuest("demo-guest-report-token-wrong-000000");
    // Then
    expect(await guestReport()).toMatchObject({
      buildingId: DEMO_BUILDING_ID,
      reporterUserId: null,
      reporterKind: "guest",
      preset: "trash_overflow",
      body: null,
      status: "received",
    });
    const tokens = await t.db
      .select()
      .from(reportAccessTokens)
      .where(eq(reportAccessTokens.reportId, DEMO_GUEST_REPORT_ID));
    expect(tokens.map((row) => row.tokenHash)).toEqual([hashToken(DEMO_GUEST_REPORT_TOKEN)]);
    expect(tokens[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: DEMO_GUEST_REPORT_ID,
      status: "received",
      viewer: "reporter",
    });
    expect(wrong.status).toBe(404);
  });

  it("puts the guest report back to received on re-seed and on reset", async () => {
    // Given: during the demo the landlord acknowledged and then resolved it
    await seedDemo(t.db, { guestReport: true });
    await t.db
      .update(reports)
      .set({ status: "acknowledged", acknowledgedAt: new Date() })
      .where(eq(reports.id, DEMO_GUEST_REPORT_ID));
    // When
    await seedDemo(t.db, { guestReport: true });
    const afterSeed = await guestReport();
    await t.db
      .update(reports)
      .set({
        status: "completed",
        acknowledgedAt: new Date(),
        resolvedAt: new Date(),
        resultNote: "치웠어요",
      })
      .where(eq(reports.id, DEMO_GUEST_REPORT_ID));
    await resetDemo(t.db, { guestReport: true });
    const afterReset = await guestReport();
    const view = await viewAsGuest();
    // Then
    expect(afterSeed).toMatchObject({ status: "received", acknowledgedAt: null });
    expect(afterReset).toMatchObject({
      status: "received",
      acknowledgedAt: null,
      resolvedAt: null,
      resultNote: null,
    });
    expect(view.status).toBe(200);
  });

  it("does not create the guest report or its public token unless asked (DEMO_MODE)", async () => {
    // Given: the demo buildings were reset outside demo mode
    await resetDemo(t.db);
    const afterReset = await guestReport();
    // When: a plain seed runs again
    await seedDemo(t.db);
    const afterSeed = await guestReport();
    const view = await viewAsGuest();
    // Then
    expect(afterReset).toBeUndefined();
    expect(afterSeed).toBeUndefined();
    expect(
      await t.db
        .select()
        .from(reportAccessTokens)
        .where(eq(reportAccessTokens.tokenHash, hashToken(DEMO_GUEST_REPORT_TOKEN))),
    ).toEqual([]);
    expect(view.status).toBe(404);
  });
});
