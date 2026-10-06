import { and, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { occupancies } from "../db/schema.ts";
import { createBuilding, createOccupancy, createUser, useTestApp } from "../test/helpers.ts";
import { activeNow, occupancyState } from "./reconfirm.ts";

const t = useTestApp();
const MINUTE_MS = 60 * 1000;
const GRACE_MS = 14 * 24 * 60 * MINUTE_MS;

describe("activeNow (SQL) and occupancyState (JS)", () => {
  it("agree on the 14-day boundary to the minute", async () => {
    // Given: requests that are one minute inside, exactly at, and one minute past the 14-day deadline
    const now = new Date();
    const building = await createBuilding(t.db, "open");
    const offsets = { inside: GRACE_MS - MINUTE_MS, exact: GRACE_MS, past: GRACE_MS + MINUTE_MS };
    const rows = await Promise.all(
      Object.entries(offsets).map(async ([name, offset]) => ({
        name,
        row: await createOccupancy(t.db, building.id, await createUser(t.db), "active", {
          nextReconfirmAt: new Date(now.getTime() - offset),
        }),
      })),
    );
    // When
    const activeIds = new Set(
      (
        await t.db
          .select({ id: occupancies.id })
          .from(occupancies)
          .where(
            and(
              inArray(
                occupancies.id,
                rows.map(({ row }) => row.id),
              ),
              activeNow(now),
            ),
          )
      ).map((row) => row.id),
    );
    // Then
    const bySql = Object.fromEntries(rows.map(({ name, row }) => [name, activeIds.has(row.id)]));
    const byJs = Object.fromEntries(
      rows.map(({ name, row }) => [name, occupancyState(row, now).status === "active"]),
    );
    expect(bySql).toEqual({ inside: true, exact: false, past: false });
    expect(byJs).toEqual(bySql);
  });
});
