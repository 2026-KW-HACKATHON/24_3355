import type { Me } from "@wolgyeham/contracts";

/**
 * 이 건물 생활 팁에서의 관계. 권한은 서버가 다시 판정하고(screens.md §1), 화면은 이것으로 보여줄 상태와 버튼만
 * 고릅니다. writer: active 거주자(읽기·쓰기), reconfirm: 재확인 필요(읽기만), landlord: 집주인(읽기·신고),
 * outsider: 연결 전·다른 건물·이사함(연결 필요 44).
 */
export type TipRole = "writer" | "reconfirm" | "landlord" | "outsider";

export function tipRoleFor(me: Me | null | undefined, buildingId: string): TipRole {
  if (!me) return "outsider";
  if (me.managedBuildings.some((building) => building.id === buildingId)) return "landlord";
  const occupancy = me.occupancy;
  if (!occupancy || occupancy.buildingId !== buildingId) return "outsider";
  return occupancy.status === "reconfirm_needed" ? "reconfirm" : "writer";
}
