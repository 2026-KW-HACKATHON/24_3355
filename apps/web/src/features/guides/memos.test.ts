import {
  CORRECTION_MEMO_BODY_MAX,
  CORRECTION_MEMO_REASON_MAX,
  type Me,
  type MeOccupancy,
} from "@wolgyeham/contracts";
import { describe, expect, it } from "vitest";
import { testUser } from "../../test/me";
import { MEMO_STATUS, memoAccess, memoOutcome, prepareKeepReason, prepareMemoBody } from "./memos";

const BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";

function occupancy(overrides: Partial<MeOccupancy> = {}): MeOccupancy {
  return {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f41",
    buildingId: BUILDING_ID,
    buildingName: "햇살빌라",
    status: "active",
    connectedAt: "2026-03-02T01:00:00.000Z",
    lastReconfirmedAt: null,
    nextReconfirmAt: "2027-03-02T01:00:00.000Z",
    reconfirmRequested: false,
    reconfirmDueAt: "2027-03-16T01:00:00.000Z",
    endedAt: null,
    ...overrides,
  };
}

function me(occ: MeOccupancy | null, managed: string[] = []): Me {
  return {
    user: testUser("5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99"),
    managedBuildings: managed.map((id) => ({ id, name: "햇살빌라" })),
    occupancy: occ,
  };
}

describe("memo status (LF-02 안내 아래)", () => {
  it("labels each status with words, not only color", () => {
    // Given
    const statuses = ["pending", "applied", "kept"] as const;
    // When
    const labels = statuses.map((status) => MEMO_STATUS[status].label);
    // Then
    expect(labels).toEqual(["집주인 확인 전", "반영됨", "기존 유지"]);
  });

  it("says when an applied memo was reflected", () => {
    // Given
    const memo = { status: "applied" as const, resolvedAt: "2026-09-21T03:00:00.000Z" };
    // When
    const text = memoOutcome(memo);
    // Then
    expect(text).toBe("9월 21일에 기본 안내에 반영했어요");
  });

  it("explains a kept memo and a memo still waiting", () => {
    // Given
    const kept = { status: "kept" as const, resolvedAt: "2026-09-21T03:00:00.000Z" };
    const pending = { status: "pending" as const, resolvedAt: null };
    // When
    const texts = [memoOutcome(kept), memoOutcome(pending)];
    // Then
    expect(texts[0]).toContain("기존 안내를 그대로");
    expect(texts[1]).toContain("기본 안내는 그대로예요");
  });
});

describe("who can leave a memo", () => {
  it("lets an active resident of this building write", () => {
    // Given
    const viewer = me(occupancy());
    // When
    const access = memoAccess(viewer, BUILDING_ID);
    // Then
    expect(access.canWrite).toBe(true);
    expect(access.reconfirm).toBe("none");
  });

  it("keeps a resident who still owes the reconfirm answer writing until the due date", () => {
    // Given
    const viewer = me(occupancy({ reconfirmRequested: true }));
    // When
    const access = memoAccess(viewer, BUILDING_ID);
    // Then
    expect(access.reconfirm).toBe("requested");
    expect(access.canWrite).toBe(true);
  });

  it("makes reconfirm_needed read-only but keeps the memo list", () => {
    // Given
    const viewer = me(occupancy({ status: "reconfirm_needed", reconfirmRequested: true }));
    // When
    const access = memoAccess(viewer, BUILDING_ID);
    // Then
    expect(access.canWrite).toBe(false);
    expect(access.resident).toBeDefined();
  });

  it("sends visitors, other buildings and landlords elsewhere", () => {
    // Given
    const visitor = memoAccess(null, BUILDING_ID);
    const other = memoAccess(
      me(occupancy({ buildingId: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f02" })),
      BUILDING_ID,
    );
    const landlord = memoAccess(me(null, [BUILDING_ID]), BUILDING_ID);
    // When
    const results = [visitor, other, landlord].map((access) => access.canWrite);
    // Then
    expect(results).toEqual([false, false, false]);
    expect(landlord.manager).toBe(true);
  });
});

describe("text sent for memos and keep reasons (contracts)", () => {
  it("cleans a memo like the server and keeps line breaks", () => {
    expect(prepareMemoBody("  월·목\t수거\r\n바뀜\u0007  ")).toEqual({
      ok: true,
      text: "월·목 수거\n바뀜",
    });
    expect(prepareMemoBody(" \n ")).toEqual({ ok: false, reason: "empty" });
    expect(prepareMemoBody("가".repeat(CORRECTION_MEMO_BODY_MAX + 1))).toEqual({
      ok: false,
      reason: "long",
    });
    expect(prepareMemoBody("가".repeat(CORRECTION_MEMO_BODY_MAX)).ok).toBe(true);
  });

  it("sends the keep reason as one line and blames length only when it is too long", () => {
    expect(prepareKeepReason("구청 안내\n다시 확인했어요")).toEqual({
      ok: true,
      text: "구청 안내 다시 확인했어요",
    });
    expect(prepareKeepReason("가".repeat(CORRECTION_MEMO_REASON_MAX + 1))).toEqual({
      ok: false,
      reason: "long",
    });
    expect(prepareKeepReason("\n")).toEqual({ ok: false, reason: "empty" });
  });
});
