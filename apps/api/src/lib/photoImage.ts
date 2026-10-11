import sharp from "sharp";

/** 저장하는 사진의 긴 변(px). 휴대폰 화면 2배 밀도에 맞춘 크기입니다. */
export const PHOTO_MAX_EDGE = 1600;
/**
 * 풀어 본 원본 픽셀 수 상한(4096×4096 ≈ 1,680만). 넘으면 풀기 전에 거절합니다(압축 폭탄 방지). 웹은 긴 변
 * 2048px로 줄여 보내므로 휴대폰 사진은 여기에 걸리지 않습니다. RGBA 8비트로 풀어도 약 64MB입니다.
 */
export const PHOTO_MAX_INPUT_PIXELS = 4096 * 4096;
/** 처리 중인 한 장 말고 기다릴 수 있는 사진 수. 넘으면 `PhotoBusyError`(잠시 뒤 다시). */
export const PHOTO_QUEUE_MAX_WAITING = 3;
const WEBP_QUALITY = 80;

// API 컨테이너 메모리(256MB)를 넘지 않게 libvips 캐시를 끄고 스레드를 하나로 둡니다.
sharp.cache(false);
sharp.concurrency(1);

export type UploadType = "image/jpeg" | "image/png" | "image/webp";

/** 파일 앞 바이트(magic bytes)로 형식을 봅니다. 브라우저가 보낸 Content-Type은 믿지 않습니다. */
export function sniffImageType(bytes: Uint8Array): UploadType | null {
  const at = (offset: number, values: readonly number[]) =>
    values.every((value, index) => bytes[offset + index] === value);
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // RIFF....WEBP
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}

const FORMAT_OF: Record<UploadType, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

export class PhotoDecodeError extends Error {
  override readonly name = "PhotoDecodeError";
}

/** 처리 줄이 가득 참. 서버는 429 `RATE_LIMITED`(Retry-After)로 답합니다. */
export class PhotoBusyError extends Error {
  override readonly name = "PhotoBusyError";
}

let queue: Promise<unknown> = Promise.resolve();
/** 처리 중이거나 기다리는 사진 수. */
let inFlight = 0;

/** 처리 줄에 자리가 없는지. 올리기 경로가 본문을 읽기 전에 봅니다. */
export function isPhotoQueueFull(): boolean {
  return inFlight > PHOTO_QUEUE_MAX_WAITING;
}

/**
 * 한 번에 하나씩 처리합니다. 큰 사진 여러 장이 동시에 풀려 메모리가 튀지 않게 하고, 처리 중 1장 + 기다리는
 * 3장을 넘으면 받지 않습니다(`PhotoBusyError`).
 */
function serial<T>(work: () => Promise<T>): Promise<T> {
  if (isPhotoQueueFull()) return Promise.reject(new PhotoBusyError("photo queue full"));
  inFlight += 1;
  const run = queue.then(work, work).finally(() => {
    inFlight -= 1;
  });
  queue = run.catch(() => undefined);
  return run;
}

/**
 * 받은 사진을 다시 만듭니다: EXIF 방향대로 돌리고, 긴 변을 1600px 이하로 줄이고, WebP(품질 80)로 저장합니다.
 * sharp는 `withMetadata`를 부르지 않으면 EXIF(GPS 위치 포함)·ICC·XMP를 모두 버립니다. 움직이는 사진은 첫 장만
 * 씁니다. 형식이 앞 바이트와 다르거나, 풀 수 없거나, 8비트가 아니거나, 4096×4096 픽셀을 넘으면
 * `PhotoDecodeError`, 처리 줄이 가득 차면 `PhotoBusyError`입니다.
 */
export function normalizePhoto(bytes: Uint8Array, type: UploadType) {
  return serial(async () => {
    try {
      const image = sharp(bytes, {
        limitInputPixels: PHOTO_MAX_INPUT_PIXELS,
        failOn: "error",
        pages: 1,
      });
      const meta = await image.metadata();
      if (meta.format !== FORMAT_OF[type]) throw new PhotoDecodeError("format mismatch");
      // 16비트·부동소수 사진은 풀면 메모리를 몇 배로 써서 받지 않습니다(휴대폰 사진은 8비트).
      if (meta.depth !== "uchar") throw new PhotoDecodeError("unsupported depth");
      const { data, info } = await image
        .rotate()
        .resize({
          width: PHOTO_MAX_EDGE,
          height: PHOTO_MAX_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
      return { bytes: new Uint8Array(data), width: info.width, height: info.height };
    } catch (error) {
      if (error instanceof PhotoDecodeError) throw error;
      throw new PhotoDecodeError("decode failed", { cause: error });
    }
  });
}
