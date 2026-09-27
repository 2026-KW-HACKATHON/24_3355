// 그 밖의 주소 · lofi 22 (건물 없음과 같은 화면)
import { BuildingNotFound } from "../../features/buildings/BuildingNotFound";

export function Component() {
  return <BuildingNotFound onRetry={() => window.location.reload()} />;
}
