import type { Me, MeOccupancy } from "@wolgyeham/contracts";
import { describe, expect, it } from "vitest";
import { AppError } from "../../lib/errors";
import { testUser } from "../../test/me";
import { formatTipMonth, TIP_CATEGORY_LABEL, tipWriteError } from "./labels";
import { tipRoleFor } from "./role";

const BUILDING = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
const OTHER = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f02";

function occupancy(buildingId: string, status: MeOccupancy["status"]): MeOccupancy {
  return {
    id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f41",
    buildingId,
    buildingName: "햇살빌라",
    status,
    connectedAt: "2026-03-02T01:00:00.000Z",
    lastReconfirmedAt: null,
    nextReconfirmAt: "2027-03-02T01:00:00.000Z",
    reconfirmRequested: false,
    reconfirmDueAt: "2027-03-16T01:00:00.000Z",
    endedAt: null,
  };
}

function me(occ: MeOccupancy | null, managed: string[] = []): Me {
  return {
    user: testUser("5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99"),
    managedBuildings: managed.map((id) => ({ id, name: "햇살빌라" })),
    occupancy: occ,
  };
}

describe("tip role", () => {
  it("lets active residents write and others only read or connect", () => {
    expect(tipRoleFor(me(occupancy(BUILDING, "active")), BUILDING)).toBe("writer");
    expect(tipRoleFor(me(occupancy(BUILDING, "reconfirm_needed")), BUILDING)).toBe("reconfirm");
    expect(tipRoleFor(me(null, [BUILDING]), BUILDING)).toBe("landlord");
    expect(tipRoleFor(me(occupancy(OTHER, "active")), BUILDING)).toBe("outsider");
    expect(tipRoleFor(me(null), BUILDING)).toBe("outsider");
    expect(tipRoleFor(null, BUILDING)).toBe("outsider");
  });
});

describe("tip labels", () => {
  it("shows only the month the tip was written", () => {
    expect(formatTipMonth("2026-09")).toBe("2026년 9월");
    expect(formatTipMonth("2025-12")).toBe("2025년 12월");
  });

  it("names every category like lofi 19", () => {
    expect(Object.values(TIP_CATEGORY_LABEL)).toEqual([
      "분리수거",
      "택배",
      "겨울",
      "공용공간",
      "기타",
    ]);
  });

  it("explains why an own tip cannot be changed after moving out", () => {
    expect(tipWriteError(new AppError("NOT_CONNECTED"), "delete")).toContain("운영팀에 요청");
    expect(tipWriteError(new AppError("NETWORK"), "save")).toContain("쓴 내용은 그대로 있어요");
  });
});
