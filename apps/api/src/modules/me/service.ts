import type { Me } from "@wolgyeham/contracts";
import type { Database } from "../../lib/db.ts";
import * as authService from "../auth/service.ts";
import * as buildingService from "../buildings/service.ts";
import * as occupancyService from "../occupancies/service.ts";

export async function getMe(db: Database, userId: string): Promise<Me> {
  const buildings = await buildingService.listManagedBuildings(db, userId);
  return {
    user: { id: userId, ...(await authService.getTermsConsent(db, userId)) },
    managedBuildings: buildings.map((building) => ({ id: building.id, name: building.name })),
    occupancy: await occupancyService.getLiveOccupancy(db, userId),
  };
}
