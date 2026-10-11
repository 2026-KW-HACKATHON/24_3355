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
