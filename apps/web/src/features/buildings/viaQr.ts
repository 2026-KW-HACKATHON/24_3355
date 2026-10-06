// 현관 QR에 인쇄한 주소는 `/b/:buildingId?via=qr`입니다(lib/share.ts의 publicBuildingQrUrl).
// 주소 나누기(app/BuildingRoute)가 첫 렌더에 한 번 읽고 주소에서 지웁니다. 공유·북마크한 주소에는 남지 않습니다.
const PARAM = "via";

/** 인쇄한 현관 QR로 열었는지. */
export function readViaQr(search: string): boolean {
  return new URLSearchParams(search).get(PARAM) === "qr";
}

/** `via`를 뺀 쿼리(`?a=1` 또는 빈 문자열). 없으면 undefined(주소를 바꾸지 않음). */
export function searchWithoutVia(search: string): string | undefined {
  const params = new URLSearchParams(search);
  if (!params.has(PARAM)) return undefined;
  params.delete(PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
