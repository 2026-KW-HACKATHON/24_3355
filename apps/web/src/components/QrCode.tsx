import { useMemo } from "react";
import { encode } from "uqr";

// 공개 건물 주소 QR. 인쇄해 현관에 붙이므로 오류 정정은 M(약 15%)으로 둡니다.
function qrPath(text: string): { path: string; size: number } {
  const { data, size } = encode(text, { ecc: "M", border: 0 });
  let path = "";
  data.forEach((row, y) => {
    row.forEach((on, x) => {
      if (on) path += `M${x} ${y}h1v1h-1z`;
    });
  });
  return { path, size };
}

/** 실제로 찍히는 QR(SVG). `label`은 읽기 보조용 설명입니다. */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const { path, size } = useMemo(() => qrPath(value), [value]);
  return (
    <svg
      className={className ? `wh-qr ${className}` : "wh-qr"}
      viewBox={`-2 -2 ${size + 4} ${size + 4}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect x={-2} y={-2} width={size + 4} height={size + 4} className="wh-qr__bg" />
      <path d={path} className="wh-qr__dots" />
    </svg>
  );
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 인쇄용 PNG(건물 이름 + QR + 주소). 캔버스로 그려 내려받습니다. 색은 --wh-* 토큰을 읽습니다. */
export async function downloadQrPng({
  value,
  title,
  caption,
  fileName,
}: {
  value: string;
  title: string;
  caption: string;
  fileName: string;
}): Promise<boolean> {
  const { data, size } = encode(value, { ecc: "M", border: 0 });
  const width = 1200;
  const cell = Math.floor(880 / size);
  const qrSize = cell * size;
  const height = qrSize + 520;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return false;
  const ink = token("--wh-text");
  context.fillStyle = token("--wh-surface");
  context.fillRect(0, 0, width, height);
  context.fillStyle = ink;
  context.textAlign = "center";
  context.font = '800 64px "Pretendard Variable", Pretendard, sans-serif';
  context.fillText(title, width / 2, 130);
  context.font = '500 38px "Pretendard Variable", Pretendard, sans-serif';
  context.fillText("휴대폰 카메라로 찍으면 건물 안내가 열려요", width / 2, 200);
  const left = (width - qrSize) / 2;
  const top = 260;
  data.forEach((row, y) => {
    row.forEach((on, x) => {
      if (on) context.fillRect(left + x * cell, top + y * cell, cell, cell);
    });
  });
  context.font = '500 32px "Pretendard Variable", Pretendard, sans-serif';
  context.fillStyle = token("--wh-text-strong-subtle");
  context.fillText(caption, width / 2, top + qrSize + 100);
  context.font = '800 34px "Pretendard Variable", Pretendard, sans-serif';
  context.fillStyle = ink;
  context.fillText("월계함", width / 2, top + qrSize + 170);

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
