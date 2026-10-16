// 인쇄물(현관 안내문·안내 스티커)을 캔버스로 그려 PNG로 내려받을 때 함께 쓰는 것.

/** `--wh-*` 색 토큰의 지금 값. 캔버스는 CSS 변수를 읽지 못해서 그릴 때 꺼냅니다. */
export function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 캔버스를 PNG 파일로 내려받습니다. 만들지 못하면 false. */
export async function saveCanvasPng(canvas: HTMLCanvasElement, fileName: string): Promise<boolean> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
