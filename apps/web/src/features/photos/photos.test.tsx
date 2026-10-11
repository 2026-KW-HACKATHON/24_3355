import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Guide, PhotoConfig } from "@wolgyeham/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppError } from "../../lib/errors";
import { GuideBody } from "../guides/GuideBody";
import { fitWithin, PhotoReadError } from "./downscale";
import {
  PHOTO_PRIVACY_HINT,
  PhotoPicker,
  type PhotoPickerState,
  uploadErrorMessage,
} from "./PhotoPicker";
import {
  addUploading,
  fromKeys,
  isUploading,
  keysOf,
  markBroken,
  markDone,
  markFailed,
  remainingSlots,
  removeItem,
} from "./pickerState";
import { photoKeys } from "./queries";

const BUILDING = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
const key = (n: number) =>
  `buildings/${BUILDING}/5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f${String(n).padStart(2, "0")}.webp`;

describe("photo picker state", () => {
  it("keeps order, saves only uploaded keys and counts every tile against the limit", () => {
    // Given
    let items = fromKeys([key(1)]);
    // When
    items = addUploading(items, ["u1", "u2"]);
    items = markDone(items, "u2", key(3));
    items = markFailed(items, "u1", "실패");
    // Then
    expect(keysOf(items)).toEqual([key(1), key(3)]);
    expect(remainingSlots(items)).toBe(1);
    expect(isUploading(items)).toBe(false);
    expect(items[2]).toEqual({
      id: "u2",
      status: "done",
      key: key(3),
      url: `/api/photos/${key(3)}`,
    });
  });

  it("turns an uploaded tile whose thumbnail fails to load into a failed tile", () => {
    // When
    const items = markBroken(fromKeys([key(1), key(2)]), key(1), "불러오지 못했어요");
    // Then
    expect(keysOf(items)).toEqual([key(2)]);
    expect(items[0]).toMatchObject({ status: "failed" });
  });

  it("ignores an upload that finishes after its tile was removed", () => {
    // Given
    let items = addUploading([], ["u1"]);
    expect(isUploading(items)).toBe(true);
    // When
    items = removeItem(items, "u1");
    items = markDone(items, "u1", key(1));
    // Then
    expect(items).toEqual([]);
    expect(remainingSlots(items)).toBe(4);
  });
});

describe("downscale size", () => {
  it("fits the long edge into 2048px and never enlarges", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("upload error copy", () => {
  it("picks a message by error kind", () => {
    expect(uploadErrorMessage(new PhotoReadError("x"))).toContain("열 수 없어요");
    expect(uploadErrorMessage(new AppError("NETWORK"))).toContain("다시 골라 주세요");
    expect(uploadErrorMessage(new AppError("PHOTO_INVALID"))).toContain("올릴 수 없어요");
  });
});

function render(picker: PhotoPickerState, config: PhotoConfig | undefined) {
  const client = new QueryClient();
  if (config) client.setQueryData(photoKeys.config(), config);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <PhotoPicker picker={picker} label="분리수거 안내" />
    </QueryClientProvider>,
  );
}

function pickerOf(items: PhotoPickerState["items"]): PhotoPickerState {
  return {
    items,
    keys: keysOf(items),
    busy: isUploading(items),
    add: async () => 0,
    remove: () => undefined,
    broken: () => undefined,
  };
}

const ENABLED: PhotoConfig = { uploadsEnabled: true, maxPhotos: 4, maxUploadBytes: 8388608 };

describe("PhotoPicker", () => {
  it("is hidden when the server does not take photos", () => {
    expect(render(pickerOf([]), { ...ENABLED, uploadsEnabled: false })).toBe("");
    expect(render(pickerOf([]), undefined)).toBe("");
  });

  it("shows thumbnails with labelled remove buttons, the add button and the privacy hint", () => {
    // When
    const html = render(pickerOf(addUploading(fromKeys([key(1)]), ["u1"])), ENABLED);
    // Then
    expect(html).toContain('alt="분리수거 안내 사진 1"');
    expect(html).toContain('aria-label="사진 1 빼기"');
    expect(html).toContain('aria-label="사진 2 올리는 중"');
    expect(html).toContain('aria-label="사진 추가 (2/4)"');
    expect(html).toContain('accept="image/*"');
    expect(html).toContain(PHOTO_PRIVACY_HINT);
    expect(html).toContain("올리는 중이에요");
  });

  it("drops the add button at four photos", () => {
    const html = render(pickerOf(fromKeys([key(1), key(2), key(3), key(4)])), ENABLED);
    expect(html).not.toContain("사진 추가");
    expect(html).toContain('aria-label="사진 4 빼기"');
  });
});

describe("GuideBody photos", () => {
  it("labels photos with the guide title and opens the original", () => {
    // Given
    const guide: Guide = {
      id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f11",
      buildingId: BUILDING,
      category: "recycling",
      title: "분리수거함 위치",
      body: "주차장 안쪽",
      photos: fromKeys([key(1)]).flatMap((item) =>
        item.status === "done" ? [{ key: item.key, url: item.url }] : [],
      ),
      status: "published",
      position: 0,
      publishedAt: "2026-03-16T01:00:00.000Z",
      updatedAt: "2026-03-16T01:00:00.000Z",
    };
    // When
    const page = renderToStaticMarkup(<GuideBody guide={guide} />);
    const card = renderToStaticMarkup(<GuideBody guide={guide} variant="card" />);
    // Then
    expect(page).toContain('alt="분리수거함 위치 사진 1"');
    expect(page).toContain(`href="/api/photos/${key(1)}"`);
    expect(page).toContain('loading="lazy"');
    expect(card).not.toContain("href=");
  });
});
