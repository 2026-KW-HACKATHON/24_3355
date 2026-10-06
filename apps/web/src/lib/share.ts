// 링크 복사·공유. 카카오톡 공유는 기기 공유 창(Web Share API)으로 받는 사람을 사람이 직접 고릅니다.
// 공유 창이 없으면 복사로 대신합니다(screens.md §6: 자동 발송이 아님).

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/**
 * 인쇄·공유용 공개 주소의 출처. 현관 QR·입주 카드는 한 번 붙이면 바꾸기 어려워서, PR 미리 보기나 로컬
 * 주소가 인쇄되지 않도록 `VITE_PUBLIC_ORIGIN`(예: `https://wolgyeham.example`)을 먼저 씁니다.
 * 값이 없거나 http(s) 주소가 아니면 지금 연 주소의 출처를 씁니다.
 */
export function publicOrigin(
  configured: string | undefined = import.meta.env["VITE_PUBLIC_ORIGIN"],
  fallback: string = window.location.origin,
): string {
  if (!configured) return fallback;
  try {
    const url = new URL(configured);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : fallback;
  } catch {
    return fallback;
  }
}

/** 공개 건물 화면 주소. 링크 복사·카카오톡 공유에 씁니다. */
export function publicBuildingUrl(buildingId: string, origin = publicOrigin()): string {
  return `${origin}/b/${buildingId}`;
}

/**
 * 인쇄하는 QR에 담는 주소. `?via=qr`이 있어야 공개 화면이 ‘현관 QR’로 들어온 것을 알고 표시합니다
 * (주소 나누기 app/BuildingRoute가 읽고 주소에서 지움). 공유 링크에는 붙이지 않습니다.
 */
export function publicBuildingQrUrl(buildingId: string, origin = publicOrigin()): string {
  return `${publicBuildingUrl(buildingId, origin)}?via=qr`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false; // 권한이 막혔거나 http 환경
  }
}

export function canShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** 공유 창을 열고, 없으면 `url`(또는 `text`)을 복사합니다. */
export async function shareOrCopy({
  title,
  text,
  url,
}: {
  title: string;
  text?: string;
  url: string;
}): Promise<ShareOutcome> {
  if (canShare()) {
    try {
      await navigator.share({ title, url, ...(text ? { text } : {}) });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // 공유 창을 열 수 없으면 아래에서 복사합니다.
    }
  }
  const copied = await copyText(text ? `${text}\n${url}` : url);
  return copied ? "copied" : "failed";
}
