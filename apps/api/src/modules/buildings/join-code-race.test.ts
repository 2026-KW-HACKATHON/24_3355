import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBuilding,
  createUser,
  jsonRequest,
  sessionCookie,
  setJoinCode,
  useTestApp,
} from "../../test/helpers.ts";
import * as repo from "./repo.ts";

// 코드를 몇 번 비교했는지 세려고 현재 코드 조회를 감쌉니다(비교할 때만 부름).
vi.mock("./repo.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repo.ts")>();
  return { ...actual, findCurrentJoinCode: vi.fn(actual.findCurrentJoinCode) };
});

const t = useTestApp({ TRUSTED_PROXY_HOPS: "1" });

afterEach(() => {
  vi.restoreAllMocks();
});

function check(buildingId: string, code: string, ip: string, cookie?: string) {
  const init = jsonRequest("POST", { code }, cookie);
  return t.app.request(`/api/buildings/${buildingId}/join-code/check`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), "X-Forwarded-For": ip },
  });
}

function comparisons(buildingId: string) {
  return vi.mocked(repo.findCurrentJoinCode).mock.calls.filter(([, id]) => id === buildingId)
    .length;
}

async function codeOf(response: Response) {
  return response.status < 300
    ? response.status
    : `${response.status} ${(await response.json()).error.code}`;
}

describe("join code attempts under concurrency", () => {
  it("compares at most 5 codes from one client even when 20 wrong codes arrive at once", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "WK72P4");
    const ip = "192.0.2.10";
    // When: 20 wrong codes at the same time, then the right one
    const burst = await Promise.all(
      Array.from({ length: 20 }, () => check(building.id, "AAAAAA", ip)),
    );
    const right = await check(building.id, "WK72P4", ip);
    // Then
    const results = await Promise.all(burst.map(codeOf));
    expect(results.filter((code) => code === "409 JOIN_CODE_INVALID")).toHaveLength(4);
    expect(results.filter((code) => code === "429 JOIN_CODE_LOCKED")).toHaveLength(16);
    expect(await codeOf(right)).toBe("429 JOIN_CODE_LOCKED");
    expect(comparisons(building.id)).toBe(5);
  });

  it("never compares more than 5 codes when the right code is in the burst", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "WK72P4");
    const ip = "192.0.2.11";
    const codes = Array.from({ length: 21 }, (_, i) => (i === 10 ? "WK72P4" : "AAAAAA"));
    // When
    const results = await Promise.all(
      codes.map(async (code) => codeOf(await check(building.id, code, ip))),
    );
    // Then: the right code only passes if it was among the first five attempts
    expect(comparisons(building.id)).toBeLessThanOrEqual(5);
    const compared = results.filter((code) => code === 200 || code === "409 JOIN_CODE_INVALID");
    expect(compared.length).toBeLessThanOrEqual(5);
    expect(results.filter((code) => code === "429 JOIN_CODE_LOCKED").length).toBeGreaterThanOrEqual(
      16,
    );
  });

  it("caps a building at 30 attempts per 10 minutes across many clients and warns once", async () => {
    // Given
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "WK72P4");
    // When: 31 different addresses each try one wrong code, then a new address tries the right code
    const results = await Promise.all(
      Array.from({ length: 31 }, (_, i) => check(building.id, "AAAAAA", `198.51.100.${i + 1}`)),
    );
    const right = await check(building.id, "WK72P4", "203.0.113.200");
    // Then
    const codes = await Promise.all(results.map(codeOf));
    expect(codes.filter((code) => code === "409 JOIN_CODE_INVALID")).toHaveLength(30);
    expect(codes.filter((code) => code === "429 JOIN_CODE_LOCKED")).toHaveLength(1);
    expect(await codeOf(right)).toBe("429 JOIN_CODE_LOCKED");
    expect(comparisons(building.id)).toBe(30);
    const warnings = warn.mock.calls.filter(([line]) =>
      String(line).includes("join_code_building_locked"),
    );
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0]?.[0])).not.toContain("198.51.100");
  });

  it("does not let one address that keeps guessing lock out everyone else", async () => {
    // Given: 31 wrong codes from one address (only its first five are compared)
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "WK72P4");
    for (let i = 0; i < 31; i++) await check(building.id, "AAAAAA", "203.0.113.50");
    // When
    const other = await check(building.id, "WK72P4", "203.0.113.51");
    // Then
    expect(await codeOf(other)).toBe(200);
    expect(comparisons(building.id)).toBe(6);
  });

  it("never locks a building for people entering the right code", async () => {
    // Given
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "WK72P4");
    // When: 32 residents check the right code from different addresses
    const results = [];
    for (let i = 0; i < 32; i++) {
      results.push(await codeOf(await check(building.id, "WK72P4", `198.51.100.${i + 1}`)));
    }
    const wrongAfter = await check(building.id, "AAAAAA", "198.51.100.200");
    // Then
    expect(results).toEqual(Array(32).fill(200));
    expect(await codeOf(wrongAfter)).toBe("409 JOIN_CODE_INVALID");
  });

  it("keeps logged-in connections outside the building-wide lock", async () => {
    // Given: guesses from 31 addresses locked unauthenticated checks on this building
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const building = await createBuilding(t.db, "open");
    await setJoinCode(t.db, building.id, "WK72P4");
    for (let i = 0; i < 31; i++) await check(building.id, "AAAAAA", `192.0.2.${i + 1}`);
    const cookie = await sessionCookie(t.db, await createUser(t.db));
    // When
    const anonymous = await check(building.id, "WK72P4", "203.0.113.99");
    const signedInCheck = await check(building.id, "WK72P4", "203.0.113.99", cookie);
    const connect = await t.app.request(
      `/api/buildings/${building.id}/occupancies`,
      jsonRequest("POST", { code: "WK72P4" }, cookie),
    );
    // Then
    expect(await codeOf(anonymous)).toBe("429 JOIN_CODE_LOCKED");
    expect(await codeOf(signedInCheck)).toBe(200);
    expect(await codeOf(connect)).toBe(201);
    warn.mockRestore();
  });
});
