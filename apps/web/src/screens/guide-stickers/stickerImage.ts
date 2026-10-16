// 안내 스티커 한 장을 5×5cm 약 300dpi PNG(600×600, 1mm = 12px)로 그려 내려받습니다. 배치는 guide-stickers.css의
// mm 값과 같고, 색은 --wh-* 토큰을 읽습니다. 종류 아이콘은 화면에 그려진 SVG를 그대로 옮겨 그립니다.
import { encode } from "uqr";
import { saveCanvasPng, cssToken as token } from "../../lib/canvasPng";
import { STICKER_HINT, STICKER_MM } from "./stickerContent";

const PX_PER_MM = 12;
const SIZE = STICKER_MM * PX_PER_MM;
const PAD = 3 * PX_PER_MM;
const FONT = '"Pretendard Variable", Pretendard, sans-serif';

export type StickerImageInput = {
  qrValue: string;
  categoryLabel: string;
  title: string;
  /** 화면의 종류 아이콘(SVG). 없으면 글자만 그립니다. */
  icon?: SVGSVGElement | null | undefined;
};

function svgImage(svg: SVGSVGElement, color: string): Promise<HTMLImageElement | null> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("stroke", color);
  clone.setAttribute("width", "48");
  clone.setAttribute("height", "48");
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }),
  );
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

/** 띄어쓰기에서 먼저 나누고, 한 낱말이 넘치면 글자로 나눕니다. 두 줄을 넘으면 끝을 줄입니다. */
function wrapLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    const joined = line ? `${line} ${word}` : word;
    if (context.measureText(joined).width <= maxWidth) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const char of word) {
      const candidate = line + char;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = candidate;
      }
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] ?? "";
  while (last && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

export async function drawSticker(input: StickerImageInput): Promise<HTMLCanvasElement | null> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  await Promise.all(
    ["600", "700", "800"].map((weight) =>
      document.fonts?.load(`${weight} 30px ${FONT}`).catch(() => undefined),
    ),
  );
  const ink = token("--wh-navy-600");
  const subtle = token("--wh-text-subtle");
  const line = token("--wh-gray-200");
  const white = token("--wh-gray-0");
  const icon = input.icon ? await svgImage(input.icon, ink) : null;
  context.textBaseline = "top";

  // 바탕과 오릴 자리(가장자리 선)
  context.fillStyle = white;
  context.fillRect(0, 0, SIZE, SIZE);
  context.strokeStyle = line;
  context.lineWidth = 2;
  context.strokeRect(1, 1, SIZE - 2, SIZE - 2);

  // 종류(아이콘 + 이름)
  let x = PAD;
  if (icon) {
    context.drawImage(icon, PAD, PAD, 48, 48);
    x += 60;
  }
  context.fillStyle = ink;
  context.font = `700 30px ${FONT}`;
  context.fillText(input.categoryLabel, x, PAD + 9);

  // 안내 제목(두 줄까지)
  context.font = `800 40px ${FONT}`;
  wrapLines(context, input.title, SIZE - PAD * 2, 2).forEach((text, index) => {
    context.fillText(text, PAD, 100 + index * 50);
  });

  // QR(둘레 1칸 여백)
  const footTop = SIZE - PAD - 30;
  const qrTop = 212;
  const qrSize = footTop - 12 - qrTop;
  const { data, size } = encode(input.qrValue, { ecc: "M", border: 0 });
  const cell = qrSize / (size + 2);
  const left = (SIZE - qrSize) / 2 + cell;
  context.fillStyle = ink;
  data.forEach((row, y) => {
    row.forEach((on, column) => {
      if (on)
        context.fillRect(left + column * cell, qrTop + cell + y * cell, cell + 0.5, cell + 0.5);
    });
  });

  // 아래 줄: 월계함 · 안내 문구
  context.font = `800 30px ${FONT}`;
  context.fillText("월계함", PAD, footTop);
  context.textAlign = "right";
  context.fillStyle = subtle;
  context.font = `600 22px ${FONT}`;
  context.fillText(STICKER_HINT, SIZE - PAD, footTop + 6);
  return canvas;
}

export async function downloadStickerPng(
  input: StickerImageInput,
  fileName: string,
): Promise<boolean> {
  const canvas = await drawSticker(input);
  return canvas ? saveCanvasPng(canvas, fileName) : false;
}
