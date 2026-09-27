import type { ManagedBuildingDetail, ManagedBuildingSummary } from "@wolgyeham/contracts";
import type { Database } from "../../lib/db.ts";
import * as buildingService from "../buildings/service.ts";
import * as guideService from "../guides/service.ts";

/** 관리 화면은 건물과 안내를 함께 보여주므로 두 모듈의 서비스를 묶습니다. */
export async function listManagedBuildings(
  db: Database,
  userId: string,
): Promise<ManagedBuildingSummary[]> {
  const buildings = await buildingService.listManagedBuildings(db, userId);
  const counts = await guideService.countGuides(
    db,
    buildings.map((building) => building.id),
  );
  return buildings.map((building) => ({
    ...building,
    publishedGuideCount: counts.get(building.id)?.published ?? 0,
    draftGuideCount: counts.get(building.id)?.draft ?? 0,
  }));
}

export async function getManagedBuildingDetail(
  db: Database,
  userId: string,
  buildingId: string,
): Promise<ManagedBuildingDetail> {
  const building = await buildingService.getManagedBuilding(db, userId, buildingId);
  return { building, guides: await guideService.listAllGuides(db, building.id) };
}
