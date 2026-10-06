import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { reportAccessTokens, reportSubmissions, reports } from "../../db/schema.ts";
import { hashToken } from "../../lib/auth.ts";
import {
  createBuilding,
  createManagedBuilding,
  createOccupancy,
  createReport,
  createReportToken,
  createUser,
  jsonRequest,
  sessionCookie,
  TEST_ORIGIN,
  useTestApp,
  withCookie,
} from "../../test/helpers.ts";

// 비회원 반복 제한은 IP 기준이라 요청마다 X-Forwarded-For로 IP를 정합니다(프록시 한 단계를 믿음).
const t = useTestApp({ TRUSTED_PROXY_HOPS: "1" });
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function randomIp() {
  return `198.51.${randomInt(256)}.${randomInt(1, 255)}`;
}

function send(buildingId: string, body: unknown, options: { cookie?: string; ip?: string } = {}) {
  const init = jsonRequest("POST", body, options.cookie);
  return t.app.request(`/api/buildings/${buildingId}/reports`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      "X-Forwarded-For": options.ip ?? randomIp(),
    },
  });
}

function view(reportId: string, options: { cookie?: string; token?: string } = {}) {
  return t.app.request(`/api/reports/${reportId}`, {
    headers: {
      Origin: TEST_ORIGIN,
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.token ? { "X-Report-Token": options.token } : {}),
    },
  });
}

async function member(
  buildingId?: string,
  status: "active" | "inactive" = "active",
  overdue = false,
) {
  const userId = await createUser(t.db);
  if (buildingId) {
    await createOccupancy(
      t.db,
      buildingId,
      userId,
      status,
      overdue ? { nextReconfirmAt: new Date(Date.now() - 15 * DAY_MS) } : {},
    );
  }
  return { userId, cookie: await sessionCookie(t.db, userId) };
}

const preset = { source: "preset", preset: "trash_overflow" } as const;

async function codeOf(response: Response) {
  return response.status < 300
    ? response.status
    : `${response.status} ${(await response.json()).error.code}`;
}

describe("POST /buildings/:buildingId/reports", () => {
  it("lets a guest send a preset phrase and returns a one-time token stored only as a hash", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    // When
    const response = await send(building.id, { ...preset, detail: "  " });
    // Then
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.report).toEqual({
      id: expect.any(String),
      buildingId: building.id,
      buildingName: building.name,
      preset: "trash_overflow",
      kind: "trash",
      location: null,
      body: null,
      status: "received",
      resultNote: null,
      createdAt: expect.any(String),
      acknowledgedAt: null,
      resolvedAt: null,
    });
    expect(body.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const expires = Date.parse(body.accessExpiresAt);
    expect(expires - Date.now()).toBeGreaterThan(29.9 * DAY_MS);
    expect(expires - Date.now()).toBeLessThan(30.1 * DAY_MS);
    const [stored] = await t.db.select().from(reports).where(eq(reports.id, body.report.id));
    expect(stored).toMatchObject({ reporterUserId: null, reporterKind: "guest" });
    const tokens = await t.db
      .select()
      .from(reportAccessTokens)
      .where(eq(reportAccessTokens.reportId, body.report.id));
    expect(tokens.map((row) => row.tokenHash)).toEqual([hashToken(body.accessToken)]);
    expect(JSON.stringify(tokens)).not.toContain(body.accessToken);
  });

  it("takes a custom report with kind, optional location and body, and validates its length", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const custom = { source: "custom", kind: "noise", location: "stairs_hallway" };
    // When
    const created = await send(building.id, { ...custom, body: "  밤마다 복도에서 웅웅거려요 " });
    const blank = await send(building.id, { ...custom, body: "   " });
    const long = await send(building.id, { ...custom, body: "가".repeat(301) });
    const longest = await send(building.id, { ...custom, body: "나".repeat(300) });
    const unknownKind = await send(building.id, { ...custom, kind: "fight", body: "다툼" });
    const presetWithBody = await send(building.id, { ...preset, body: "섞인 필드" });
    const multiline = await send(building.id, { ...custom, body: "첫 줄\n둘째 줄" });
    const escapeSequence = await send(building.id, { ...custom, body: "\u001b[2J화면 지우기" });
    const escapeDetail = await send(building.id, { ...preset, detail: "덧붙임\u0007" });
    // Then
    expect(created.status).toBe(201);
    expect((await created.json()).report).toMatchObject({
      preset: null,
      kind: "noise",
      location: "stairs_hallway",
      body: "밤마다 복도에서 웅웅거려요",
    });
    expect(blank.status).toBe(400);
    expect(await blank.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED", fields: { body: expect.any(String) } },
    });
    expect(long.status).toBe(400);
    expect(longest.status).toBe(201);
    expect(unknownKind.status).toBe(400);
    // 알 수 없는 필드는 버리고 자주 쓰는 말만 받습니다.
    expect(presetWithBody.status).toBe(201);
    expect((await presetWithBody.json()).report.body).toBeNull();
    expect(multiline.status).toBe(201);
    expect(await codeOf(escapeSequence)).toBe("400 VALIDATION_FAILED");
    expect(await codeOf(escapeDetail)).toBe("400 VALIDATION_FAILED");
  });

  it("refuses the landlord, marks residents, and gives members no token", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const other = await createBuilding(t.db, "open");
    const active = await member(building.id);
    const overdue = await member(building.id, "active", true);
    const moved = await member(building.id, "inactive");
    const stranger = await member();
    const neighbour = await member(other.id);
    const body = (text: string) => ({ source: "custom", kind: "other", body: text });
    // When
    const results = {
      landlord: await send(building.id, body("집주인"), { cookie: managerCookie }),
      active: await send(building.id, body("거주자"), { cookie: active.cookie }),
      overdue: await send(building.id, body("재확인 필요"), { cookie: overdue.cookie }),
      moved: await send(building.id, body("이사한 사람"), { cookie: moved.cookie }),
      stranger: await send(building.id, body("다른 회원"), { cookie: stranger.cookie }),
      neighbour: await send(building.id, body("옆 건물 주민"), { cookie: neighbour.cookie }),
      missing: await send(crypto.randomUUID(), body("없는 건물")),
    };
    // Then
    expect(await codeOf(results.landlord)).toBe("403 FORBIDDEN");
    expect(await codeOf(results.missing)).toBe("404 NOT_FOUND");
    const kinds: Record<string, unknown> = {};
    for (const who of ["active", "overdue", "moved", "stranger", "neighbour"] as const) {
      const response = results[who];
      expect(response.status).toBe(201);
      const created = await response.json();
      expect(created).toMatchObject({ accessToken: null, accessExpiresAt: null });
      const [row] = await t.db.select().from(reports).where(eq(reports.id, created.report.id));
      kinds[who] = row?.reporterKind;
    }
    // 로그인했지만 이 건물 거주자가 아니면 회원(member), 로그인하지 않았을 때만 비회원(guest)입니다.
    expect(kinds).toEqual({
      active: "resident",
      overdue: "resident",
      moved: "member",
      stranger: "member",
      neighbour: "member",
    });
  });
});

describe("repeat-submission limit", () => {
  it("refuses the same normalized text from the same client within 10 minutes", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const ip = randomIp();
    const custom = (text: string) => ({ source: "custom", kind: "trash", body: text });
    await send(building.id, custom("건물 앞 쓰레기가 넘쳤어요"), { ip });
    // When
    const again = await send(building.id, custom(" 건물 앞  쓰레기가 넘쳤어요!! "), { ip });
    const otherText = await send(building.id, custom("분리수거함이 부서졌어요"), { ip });
    const otherIp = await send(building.id, custom("건물 앞 쓰레기가 넘쳤어요"));
    const otherBuilding = await send(
      (await createBuilding(t.db, "open")).id,
      custom("건물 앞 쓰레기가 넘쳤어요"),
      { ip },
    );
    // Then
    expect(again.status).toBe(429);
    expect(await again.json()).toEqual({ error: { code: "REPORT_TOO_FREQUENT" } });
    const retryAfter = Number(again.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(590);
    expect(retryAfter).toBeLessThanOrEqual(600);
    expect(otherText.status).toBe(201);
    expect(otherIp.status).toBe(201);
    expect(otherBuilding.status).toBe(201);
    const stored = await t.db.select().from(reports).where(eq(reports.buildingId, building.id));
    expect(stored).toHaveLength(3);
  });

  it("treats a preset with the same added detail as the same text, and lets it through after the window", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const ip = randomIp();
    await send(building.id, preset, { ip });
    // When
    const samePreset = await send(building.id, { ...preset, detail: "" }, { ip });
    const withDetail = await send(building.id, { ...preset, detail: "주차장 쪽이에요" }, { ip });
    await t.db
      .update(reportSubmissions)
      .set({ createdAt: new Date(Date.now() - 11 * MINUTE_MS) })
      .where(eq(reportSubmissions.buildingId, building.id));
    const later = await send(building.id, preset, { ip });
    // Then
    expect(samePreset.status).toBe(429);
    expect(withDetail.status).toBe(201);
    expect(later.status).toBe(201);
  });

  it("keys members by account, so changing IP does not reset the limit", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const a = await member(building.id);
    await send(building.id, preset, { cookie: a.cookie, ip: randomIp() });
    // When
    const response = await send(building.id, preset, { cookie: a.cookie, ip: randomIp() });
    // Then
    expect(await codeOf(response)).toBe("429 REPORT_TOO_FREQUENT");
  });

  it("caps a client at 10 reports per building per hour", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const ip = randomIp();
    for (let i = 0; i < 10; i++) {
      const response = await send(
        building.id,
        { source: "custom", kind: "other", body: `내용 ${i}` },
        { ip },
      );
      expect(response.status).toBe(201);
    }
    // When
    const eleventh = await send(
      building.id,
      { source: "custom", kind: "other", body: "열한 번째" },
      { ip },
    );
    // Then
    expect(eleventh.status).toBe(429);
    expect(await eleventh.json()).toEqual({ error: { code: "RATE_LIMITED" } });
    expect(Number(eleventh.headers.get("Retry-After"))).toBeGreaterThan(3500);
  });

  it("counts simultaneous identical sends once", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const ip = randomIp();
    // When
    const responses = await Promise.all([
      send(building.id, preset, { ip }),
      send(building.id, preset, { ip }),
    ]);
    // Then
    expect(responses.map((response) => response.status).sort()).toEqual([201, 429]);
  });

  it("drops day-old submission records and long-expired tokens on any next report", async () => {
    // Given: an old record and tokens in another building
    const other = await createManagedBuilding(t.db, "open");
    const { building } = await createManagedBuilding(t.db, "open");
    await t.db.insert(reportSubmissions).values({
      buildingId: other.building.id,
      clientKey: "ip:old",
      contentHash: "old",
      createdAt: new Date(Date.now() - 2 * DAY_MS),
    });
    const report = await createReport(t.db, other.building.id);
    const longExpired = await createReportToken(t.db, report.id, { expiresInMs: -31 * DAY_MS });
    const justExpired = await createReportToken(t.db, report.id, { expiresInMs: -DAY_MS });
    // When
    await send(building.id, preset);
    // Then
    const oldRows = await t.db
      .select()
      .from(reportSubmissions)
      .where(eq(reportSubmissions.buildingId, other.building.id));
    expect(oldRows).toEqual([]);
    const tokens = await t.db
      .select()
      .from(reportAccessTokens)
      .where(eq(reportAccessTokens.reportId, report.id));
    expect(tokens.map((row) => row.tokenHash)).toEqual([hashToken(justExpired)]);
    // 만료 직후에는 ‘보관 기간이 지남’(410), 오래되면 없는 링크(404)
    expect(await codeOf(await view(report.id, { token: justExpired }))).toBe(
      "410 REPORT_LINK_EXPIRED",
    );
    expect(await codeOf(await view(report.id, { token: longExpired }))).toBe("404 NOT_FOUND");
  });

  it("caps guest reports per building at 30 an hour across addresses, but not members", async () => {
    // Given: 30 guests from different addresses reported within the hour
    const { building } = await createManagedBuilding(t.db, "open");
    await t.db.insert(reportSubmissions).values(
      Array.from({ length: 30 }, (_, i) => ({
        buildingId: building.id,
        clientKey: `ip:guest-${i}`,
        contentHash: `hash-${i}`,
        createdAt: new Date(Date.now() - 30 * MINUTE_MS),
      })),
    );
    const a = await member(building.id);
    // When
    const guest = await send(building.id, {
      source: "custom",
      kind: "other",
      body: "31번째 비회원",
    });
    const resident = await send(
      building.id,
      { source: "custom", kind: "other", body: "거주자" },
      { cookie: a.cookie },
    );
    // Then
    expect(await codeOf(guest)).toBe("429 RATE_LIMITED");
    expect(Number(guest.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(resident.status).toBe(201);
  });
});

describe("GET /reports/:reportId", () => {
  it("shows the report to a valid token holder without revealing the reporter", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const created = await (await send(building.id, preset)).json();
    // When
    const response = await view(created.report.id, { token: created.accessToken });
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...created.report,
      viewer: "reporter",
      reporterKind: null,
      accessExpiresAt: created.accessExpiresAt,
    });
  });

  it("hides the report behind 404 for missing, wrong or other tokens, and in the query string", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const report = await createReport(t.db, building.id);
    const token = await createReportToken(t.db, report.id);
    const otherReport = await createReport(t.db, building.id);
    const otherToken = await createReportToken(t.db, otherReport.id);
    // When
    const results = {
      missing: await view(report.id),
      wrong: await view(report.id, { token: "x".repeat(43) }),
      other: await view(report.id, { token: otherToken }),
      query: await t.app.request(`/api/reports/${report.id}?t=${token}`),
      tooLong: await view(report.id, { token: `${token}${"x".repeat(200)}` }),
      unknown: await view(crypto.randomUUID(), { token }),
    };
    // Then
    for (const response of Object.values(results)) {
      expect(await codeOf(response)).toBe("404 NOT_FOUND");
    }
  });

  it("answers 410 REPORT_LINK_EXPIRED for an expired token", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const report = await createReport(t.db, building.id);
    const token = await createReportToken(t.db, report.id, { expiresInMs: -1000 });
    // When
    const response = await view(report.id, { token });
    // Then
    expect(await codeOf(response)).toBe("410 REPORT_LINK_EXPIRED");
  });

  it("lets the sending member and the landlord read, not other members or landlords", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const other = await createManagedBuilding(t.db, "open");
    const sender = await member(building.id);
    const stranger = await member(building.id);
    const report = await createReport(t.db, building.id, {
      reporterUserId: sender.userId,
      reporterKind: "resident",
    });
    // When
    const asSender = await view(report.id, { cookie: sender.cookie });
    const asLandlord = await view(report.id, { cookie: managerCookie });
    const asStranger = await view(report.id, { cookie: stranger.cookie });
    const asOtherLandlord = await view(report.id, { cookie: other.managerCookie });
    // Then
    expect(await asSender.json()).toMatchObject({
      id: report.id,
      viewer: "reporter",
      reporterKind: null,
      accessExpiresAt: null,
    });
    const landlordView = await asLandlord.json();
    expect(landlordView).toMatchObject({ viewer: "manager", reporterKind: "resident" });
    expect(JSON.stringify(landlordView)).not.toContain(sender.userId);
    expect(await codeOf(asStranger)).toBe("404 NOT_FOUND");
    expect(await codeOf(asOtherLandlord)).toBe("404 NOT_FOUND");
  });

  it("does not acknowledge a report when the landlord only opens it", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const report = await createReport(t.db, building.id);
    // When
    await view(report.id, { cookie: managerCookie });
    // Then
    const [stored] = await t.db.select().from(reports).where(eq(reports.id, report.id));
    expect(stored).toMatchObject({ status: "received", acknowledgedAt: null });
  });
});

describe("POST /buildings/:buildingId/reports/lookup", () => {
  it("returns this building's still-valid reports in token order and null for the rest", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const other = await createBuilding(t.db, "open");
    const valid = await createReport(t.db, building.id, { status: "completed" });
    const validToken = await createReportToken(t.db, valid.id);
    const expiredToken = await createReportToken(t.db, (await createReport(t.db, building.id)).id, {
      expiresInMs: -1000,
    });
    const otherToken = await createReportToken(t.db, (await createReport(t.db, other.id)).id);
    // When
    const response = await t.app.request(
      `/api/buildings/${building.id}/reports/lookup`,
      jsonRequest("POST", { tokens: [expiredToken, validToken, "y".repeat(43), otherToken] }),
    );
    // Then
    expect(response.status).toBe(200);
    const { reports: found } = await response.json();
    expect(found).toEqual([
      null,
      expect.objectContaining({ id: valid.id, status: "completed" }),
      null,
      null,
    ]);
  });

  it("limits the number of tokens and needs an existing building", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const tokens = Array.from({ length: 21 }, (_, i) => `token-${i}`.padEnd(43, "x"));
    // When
    const tooMany = await t.app.request(
      `/api/buildings/${building.id}/reports/lookup`,
      jsonRequest("POST", { tokens }),
    );
    const missing = await t.app.request(
      `/api/buildings/${crypto.randomUUID()}/reports/lookup`,
      jsonRequest("POST", { tokens: tokens.slice(0, 1) }),
    );
    // Then
    expect(await codeOf(tooMany)).toBe("400 VALIDATION_FAILED");
    expect(await codeOf(missing)).toBe("404 NOT_FOUND");
  });
});

describe("landlord handling", () => {
  function act(reportId: string, action: string, cookie?: string, body: unknown = {}) {
    return t.app.request(`/api/reports/${reportId}/${action}`, jsonRequest("POST", body, cookie));
  }

  it("acknowledges only by button, then saves a result the reporter sees", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const created = await (await send(building.id, preset)).json();
    const reportId = created.report.id;
    // When
    const early = await act(reportId, "resolve", managerCookie, { result: "completed" });
    const acknowledged = await act(reportId, "acknowledge", managerCookie);
    const twice = await act(reportId, "acknowledge", managerCookie);
    const resolved = await act(reportId, "resolve", managerCookie, {
      result: "completed",
      note: " 청소하시는 분께 오늘 오전에 치워 달라고 전했어요. ",
    });
    const again = await act(reportId, "resolve", managerCookie, { result: "unable", note: "다시" });
    const seen = await view(reportId, { token: created.accessToken });
    // Then
    expect(await codeOf(early)).toBe("409 CONFLICT");
    expect(acknowledged.status).toBe(200);
    expect(await acknowledged.json()).toMatchObject({
      status: "acknowledged",
      acknowledgedAt: expect.any(String),
      reporterKind: "guest",
    });
    expect(await codeOf(twice)).toBe("409 CONFLICT");
    expect(resolved.status).toBe(200);
    expect(await codeOf(again)).toBe("409 CONFLICT");
    expect(await seen.json()).toMatchObject({
      status: "completed",
      resultNote: "청소하시는 분께 오늘 오전에 치워 달라고 전했어요.",
      acknowledgedAt: expect.any(String),
      resolvedAt: expect.any(String),
    });
  });

  it("keeps the note optional for unable, but one line and short when present", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const report = await createReport(t.db, building.id, { status: "acknowledged" });
    const withoutNote = await createReport(t.db, building.id, { status: "acknowledged" });
    const blankNote = await createReport(t.db, building.id, { status: "acknowledged" });
    // When
    const noNote = await act(withoutNote.id, "resolve", managerCookie, { result: "unable" });
    const blank = await act(blankNote.id, "resolve", managerCookie, {
      result: "unable",
      note: "  ",
    });
    const twoLines = await act(report.id, "resolve", managerCookie, {
      result: "unable",
      note: "첫 줄\n둘째 줄",
    });
    const tooLong = await act(report.id, "resolve", managerCookie, {
      result: "unable",
      note: "가".repeat(101),
    });
    const unknownResult = await act(report.id, "resolve", managerCookie, { result: "received" });
    const ok = await act(report.id, "resolve", managerCookie, {
      result: "unable",
      note: "공용 전기 공사라 다음 달에 고칠 수 있어요",
    });
    // Then
    for (const response of [twoLines, tooLong, unknownResult]) {
      expect(await codeOf(response)).toBe("400 VALIDATION_FAILED");
    }
    expect(await noNote.json()).toMatchObject({ status: "unable", resultNote: null });
    expect(await blank.json()).toMatchObject({ status: "unable", resultNote: null });
    expect(await ok.json()).toMatchObject({
      status: "unable",
      resultNote: "공용 전기 공사라 다음 달에 고칠 수 있어요",
    });
  });

  it("stores no note for a completed result without one", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const report = await createReport(t.db, building.id, { status: "acknowledged" });
    // When
    const response = await act(report.id, "resolve", managerCookie, {
      result: "completed",
      note: "",
    });
    // Then
    expect(await response.json()).toMatchObject({ status: "completed", resultNote: null });
  });

  it("refuses everyone but this building's landlord", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const other = await createManagedBuilding(t.db, "open");
    const sender = await member(building.id);
    const report = await createReport(t.db, building.id, { reporterUserId: sender.userId });
    // When
    const results = {
      anonymous: await act(report.id, "acknowledge"),
      sender: await act(report.id, "acknowledge", sender.cookie),
      otherLandlord: await act(report.id, "acknowledge", other.managerCookie),
      unknown: await act(crypto.randomUUID(), "acknowledge", other.managerCookie),
      resolveBySender: await act(report.id, "resolve", sender.cookie, { result: "completed" }),
    };
    // Then
    expect(
      Object.fromEntries(
        await Promise.all(Object.entries(results).map(async ([who, r]) => [who, await codeOf(r)])),
      ),
    ).toEqual({
      anonymous: "401 UNAUTHENTICATED",
      sender: "403 NOT_BUILDING_MANAGER",
      otherLandlord: "403 NOT_BUILDING_MANAGER",
      unknown: "404 NOT_FOUND",
      resolveBySender: "403 NOT_BUILDING_MANAGER",
    });
    const [stored] = await t.db.select().from(reports).where(eq(reports.id, report.id));
    expect(stored?.status).toBe("received");
  });
});

describe("GET /buildings/:buildingId/reports", () => {
  it("shows the landlord the received time to the minute, and the reporter the exact time", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const report = await createReport(t.db, building.id, {
      createdAt: new Date("2026-09-25T06:12:34.567Z"),
    });
    const token = await createReportToken(t.db, report.id);
    // When
    const list = await (
      await t.app.request(`/api/buildings/${building.id}/reports`, withCookie(managerCookie))
    ).json();
    const managerView = await (await view(report.id, { cookie: managerCookie })).json();
    const reporterView = await (await view(report.id, { token })).json();
    // Then
    expect(list.reports[0].createdAt).toBe("2026-09-25T06:12:00.000Z");
    expect(managerView.createdAt).toBe("2026-09-25T06:12:00.000Z");
    expect(reporterView.createdAt).toBe("2026-09-25T06:12:34.567Z");
  });

  it("lists the building's reports newest first with only the reporter kind", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    const sender = await member(building.id);
    const older = await createReport(t.db, building.id, {
      reporterUserId: sender.userId,
      reporterKind: "resident",
      createdAt: new Date(Date.now() - DAY_MS),
    });
    const newer = await createReport(t.db, building.id, { status: "acknowledged" });
    await createReport(t.db, (await createBuilding(t.db, "open")).id);
    // When
    const all = await t.app.request(
      `/api/buildings/${building.id}/reports`,
      withCookie(managerCookie),
    );
    const received = await t.app.request(
      `/api/buildings/${building.id}/reports?status=received`,
      withCookie(managerCookie),
    );
    // Then
    const { reports: list } = await all.json();
    expect(list.map((report: { id: string }) => report.id)).toEqual([newer.id, older.id]);
    expect(list.map((report: { reporterKind: string }) => report.reporterKind)).toEqual([
      "guest",
      "resident",
    ]);
    expect(JSON.stringify(list)).not.toContain(sender.userId);
    expect((await received.json()).reports.map((report: { id: string }) => report.id)).toEqual([
      older.id,
    ]);
  });

  it("refuses residents and anonymous visitors", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const resident = await member(building.id);
    // When
    const asResident = await t.app.request(
      `/api/buildings/${building.id}/reports`,
      withCookie(resident.cookie),
    );
    const anonymous = await t.app.request(`/api/buildings/${building.id}/reports`);
    // Then
    expect(await codeOf(asResident)).toBe("403 NOT_BUILDING_MANAGER");
    expect(await codeOf(anonymous)).toBe("401 UNAUTHENTICATED");
  });
});

describe("GET /me/reports and the manage summary", () => {
  it("lists only reports sent with this account, not guest reports sent before logging in", async () => {
    // Given
    const { building } = await createManagedBuilding(t.db, "open");
    const other = await createBuilding(t.db, "open");
    const a = await member(building.id);
    const ip = randomIp();
    await send(building.id, preset, { ip }); // 로그인 전 같은 IP로 보낸 제보
    const mine = await (
      await send(
        other.id,
        { source: "custom", kind: "facility", body: "옆 건물 누수" },
        {
          cookie: a.cookie,
          ip,
        },
      )
    ).json();
    // When
    const response = await t.app.request("/api/me/reports", withCookie(a.cookie));
    const anonymous = await t.app.request("/api/me/reports");
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reports: [mine.report] });
    expect(await codeOf(anonymous)).toBe("401 UNAUTHENTICATED");
  });

  it("counts reports the landlord has not acknowledged yet", async () => {
    // Given
    const { building, managerCookie } = await createManagedBuilding(t.db, "open");
    await createReport(t.db, building.id);
    await createReport(t.db, building.id);
    await createReport(t.db, building.id, { status: "acknowledged" });
    await createReport(t.db, building.id, { status: "completed" });
    // When
    const response = await t.app.request("/api/manage/buildings", withCookie(managerCookie));
    // Then
    const { buildings } = await response.json();
    expect(buildings).toEqual([expect.objectContaining({ id: building.id, newReportCount: 2 })]);
  });
});
