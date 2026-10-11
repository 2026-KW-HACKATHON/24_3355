// 현관 안내문을 A4 300dpi PNG(2480×3508)로 그려 내려받습니다. 배치는 entrance-sign.css와 같은 포스터 좌표
// (1240×1754px)를 두 배로 키운 것이라, 화면·인쇄·내려받은 이미지가 같은 모양입니다. 색은 --wh-* 토큰을 읽습니다.
import { encode } from "uqr";
import qrSignHami from "../../assets/hami/qr-sign.png";
import { SIGN_SCAN, SIGN_TITLE } from "./signContent";

const W = 1240;
const H = 1754;
const SCALE = 2;
const FONT = '"Pretendard Variable", Pretendard, sans-serif';

export type SignImageInput = {
  qrValue: string;
  buildingName: string;
  district: string;
  road: string;
  topics: string;
  joinCode?: string | undefined;
};

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** 한 줄에 넘치면 글자 크기를 줄여 maxWidth 안에 맞춥니다(긴 건물 이름·주소). */
function fitFont(
  context: CanvasRenderingContext2D,
  text: string,
  weight: number,
  size: number,
  maxWidth: number,
) {
  let current = size;
  context.font = `${weight} ${current}px ${FONT}`;
  while (current > size * 0.5 && context.measureText(text).width > maxWidth) {
    current -= 2;
    context.font = `${weight} ${current}px ${FONT}`;
  }
}

/** 포스터의 좁힌 글자 간격. 지원하지 않는 브라우저에서는 기본 간격으로 그립니다. */
function tracking(context: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in context) context.letterSpacing = `${px}px`;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  context.beginPath();
  context.roundRect(x, y, w, h, r);
}

export async function drawEntranceSign(input: SignImageInput): Promise<HTMLCanvasElement | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  // 글꼴이 늦게 오면 기본 글꼴로 그려지므로 먼저 불러 둡니다.
  await Promise.all(
    ["500", "600", "700", "800"].map((weight) =>
      document.fonts?.load(`${weight} 40px ${FONT}`).catch(() => undefined),
    ),
  );
  const hami = await loadImage(qrSignHami);
  context.scale(SCALE, SCALE);
  context.textBaseline = "top";

  const ink = token("--wh-navy-600");
  const subtle = token("--wh-text-subtle");
  const line = token("--wh-gray-200");
  const white = token("--wh-gray-0");
  context.fillStyle = white;
  context.fillRect(0, 0, W, H);

  // 남색 주소판
  context.fillStyle = ink;
  roundRect(context, 72, 72, 1096, 272, 20);
  context.fill();
  context.strokeStyle = "rgb(255 255 255 / 0.7)";
  context.lineWidth = 2;
  roundRect(context, 85, 85, 1070, 246, 10);
  context.stroke();
  const roadTop = input.district ? 189 : 165;
  if (input.district) {
    context.fillStyle = token("--wh-navy-100");
    context.font = `500 28px ${FONT}`;
    context.fillText(input.district, 115, 140);
  }
  context.fillStyle = white;
  tracking(context, -3);
  fitFont(context, input.road, 800, 76, 1010);
  context.fillText(input.road, 115, roadTop);
  tracking(context, 0);

  // 건물 이름과 큰 문구
  context.fillStyle = subtle;
  fitFont(context, `${input.buildingName} 생활안내`, 600, 28, 1080);
  context.fillText(`${input.buildingName} 생활안내`, 80, 393);
  context.fillStyle = ink;
  context.font = `800 70px ${FONT}`;
  tracking(context, -2.5);
  context.fillText(SIGN_TITLE[0], 80, 443);
  context.fillText(SIGN_TITLE[1], 80, 529);
  tracking(context, 0);

  // QR(테두리 상자 안, 둘레 2칸 여백)
  context.fillStyle = white;
  roundRect(context, 355, 692, 530, 530, 22);
  context.fill();
  context.strokeStyle = line;
  context.stroke();
  const { data, size } = encode(input.qrValue, { ecc: "M", border: 0 });
  const cell = 490 / (size + 4);
  const origin = 375 + cell * 2;
  context.fillStyle = ink;
  data.forEach((row, y) => {
    row.forEach((on, x) => {
      // 칸 사이 틈이 보이지 않게 조금 겹쳐 칠합니다.
      if (on)
        context.fillRect(origin + x * cell, 712 + cell * 2 + y * cell, cell + 0.5, cell + 0.5);
    });
  });
  if (hami) context.drawImage(hami, 30, 972, 330, 330);

  // 안내 문구와 안내 종류
  context.textAlign = "center";
  context.fillStyle = ink;
  context.font = `700 36px ${FONT}`;
  context.fillText(SIGN_SCAN, W / 2, 1260);
  if (input.topics) {
    context.fillStyle = subtle;
    context.font = `400 29px ${FONT}`;
    context.fillText(input.topics, W / 2, 1330);
  }

  // 아래 줄: 월계함 · (켜면) 가입코드
  context.fillStyle = line;
  context.fillRect(80, 1430, 1080, 2);
  context.textAlign = "left";
  context.fillStyle = ink;
  context.font = `800 46px ${FONT}`;
  context.fillText("월계함", 80, 1464);
  if (input.joinCode) {
    context.textAlign = "right";
    context.font = `800 42px ${FONT}`;
    const codeWidth = context.measureText(input.joinCode).width;
    context.fillText(input.joinCode, 1160, 1467);
    context.fillStyle = subtle;
    context.font = `400 27px ${FONT}`;
    context.fillText("알림 받기 가입코드", 1160 - codeWidth - 18, 1478);
  }
  return canvas;
}

export async function downloadEntranceSignPng(
  input: SignImageInput,
  fileName: string,
): Promise<boolean> {
  const canvas = await drawEntranceSign(input);
  if (!canvas) return false;
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
