// 올리기 전에 브라우저에서 긴 변 2048px JPEG로 줄입니다. 전송량을 줄이고, iOS Safari의 HEIC 사진도 브라우저가
// 풀어서 JPEG로 바꿉니다. 위치 정보는 캔버스로 다시 그리면서 빠지고, 서버도 한 번 더 지웁니다(D-34).
export const UPLOAD_MAX_EDGE = 2048;
const JPEG_QUALITY = 0.85;

/** 비율을 지키며 `max` 안에 들어가는 크기. 작으면 그대로입니다. */
export function fitWithin(width: number, height: number, max = UPLOAD_MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export class PhotoReadError extends Error {
  override readonly name = "PhotoReadError";
}

async function decode(
  file: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // 아래 <img>로 다시 시도합니다(일부 Safari는 HEIC를 createImageBitmap으로 풀지 못함).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoReadError("cannot decode");
  }
}

/** 사진 파일을 JPEG Blob으로 줄입니다. 풀 수 없는 파일이면 `PhotoReadError`입니다. */
export async function downscaleForUpload(file: Blob): Promise<Blob> {
  const image = await decode(file);
  try {
    const size = fitWithin(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoReadError("no canvas");
    // 투명한 PNG가 검게 나오지 않게 흰 바탕을 깝니다.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image.source, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new PhotoReadError("encode failed");
    return blob;
  } finally {
    image.close();
  }
}
