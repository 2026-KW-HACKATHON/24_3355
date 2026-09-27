import type { CurrentNoticeResponse } from "@wolgyeham/contracts";
import type { Database } from "../../lib/db.ts";
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
