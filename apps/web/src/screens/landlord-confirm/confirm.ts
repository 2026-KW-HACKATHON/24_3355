import {
  BUILDING_NAME_MAX,
  BuildingName,
  type ConfirmManagedBuildingBody,
  type ManagedBuildingDetail,
} from "@wolgyeham/contracts";

/** 건물 이름 입력 확인(contracts `BuildingName`). 괜찮으면 undefined, 아니면 입력칸 아래 문구. */
export function buildingNameError(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "건물 이름을 적어 주세요";
  if (trimmed.length > BUILDING_NAME_MAX) {
    return `건물 이름은 ${BUILDING_NAME_MAX}자까지 쓸 수 있어요`;
  }
  return BuildingName.safeParse(trimmed).success
    ? undefined
    : "글자나 숫자로 된 이름을 적어 주세요";
}

/** 이름을 고쳤을 때만 보냅니다. 앞뒤 공백은 서버처럼 지웁니다. */
export function confirmBody(currentName: string, input: string): ConfirmManagedBuildingBody {
  const name = input.trim();
  return name === currentName ? {} : { name };
}

/**
 * 확인한 뒤 갈 곳. 쓴 안내가 없으면 첫 안내 쓰기(33), 이미 있으면(초안 포함) 관리 홈.
 * 이미 확인한 건물도 23을 건너뛰고 관리 홈으로 갑니다(`needsConfirm`).
 */
export function confirmDestination(detail: ManagedBuildingDetail): string {
  const base = `/manage/${detail.building.id}`;
  return detail.guides.length === 0 ? `${base}/guides/new` : base;
}

/** 초대를 수락한 뒤 아직 건물을 확인하지 않았으면 33 전에 23을 거칩니다. */
export function needsConfirm(detail: ManagedBuildingDetail): boolean {
  return detail.building.confirmedAt === null;
}
