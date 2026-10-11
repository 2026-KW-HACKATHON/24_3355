import { PHOTO_UPLOAD_MAX_BYTES, PHOTOS_MAX } from "@wolgyeham/contracts";
import { type ChangeEvent, useCallback, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { errorMessage, toAppError } from "../../lib/errors";
import { downscaleForUpload, PhotoReadError } from "./downscale";
import {
  addUploading,
  fromKeys,
  isUploading,
  keysOf,
  markBroken,
  markDone,
  markFailed,
  type PickerItem,
  remainingSlots,
  removeItem,
} from "./pickerState";
import { uploadPhoto, usePhotoConfig } from "./queries";
import "./photo-picker.css";

export const PHOTO_PRIVACY_HINT =
  "사람 얼굴·호수·차량번호가 보이지 않게 찍어 주세요. 사진 위치 정보는 지워져요.";

/** 고른 사진을 고를 때 바로 줄여 올립니다. 저장(미리 보기·공지 올리기)에는 `keys`만 보냅니다. */
export function usePhotoPicker(buildingId: string, initialKeys: readonly string[]) {
  const [items, setItems] = useState<PickerItem[]>(() => fromKeys(initialKeys));
  const counter = useRef(0);
  const keys = useMemo(() => keysOf(items), [items]);

  const add = useCallback(
    async (files: readonly File[]) => {
      const chosen = files.slice(0, remainingSlots(items));
      const ids = chosen.map(() => `upload-${++counter.current}`);
      setItems((prev) => addUploading(prev, ids));
      // 한 장씩 줄이고 올립니다. 휴대폰 메모리와 서버 처리 줄(한 번에 한 장)을 함께 아낍니다.
      for (const [index, file] of chosen.entries()) {
        const id = ids[index] ?? "";
        try {
          const image = await downscaleForUpload(file);
          if (image.size > PHOTO_UPLOAD_MAX_BYTES) throw new PhotoReadError("too large");
          const photo = await uploadPhoto(buildingId, image);
          setItems((prev) => markDone(prev, id, photo.key));
        } catch (error) {
          setItems((prev) => markFailed(prev, id, uploadErrorMessage(error)));
        }
      }
      return files.length - chosen.length;
    },
    [buildingId, items],
  );

  const remove = useCallback((id: string) => setItems((prev) => removeItem(prev, id)), []);
  const broken = useCallback(
    (id: string) =>
      setItems((prev) =>
        markBroken(prev, id, "사진을 불러오지 못했어요. 이 칸을 지우고 다시 골라 주세요"),
      ),
    [],
  );
  return { items, keys, busy: isUploading(items), add, remove, broken };
}

export type PhotoPickerState = ReturnType<typeof usePhotoPicker>;

export function uploadErrorMessage(error: unknown): string {
  if (error instanceof PhotoReadError) return "이 사진은 열 수 없어요. 다른 사진을 골라 주세요";
  const appError = toAppError(error);
  if (appError.code === "NETWORK" || appError.code === "INTERNAL_ERROR") {
    return "사진을 올리지 못했어요. 이 칸을 지우고 다시 골라 주세요";
  }
  return errorMessage(appError);
}

/**
 * 사진 고르기(33 사진 추가, 34). 최대 4장, 칸마다 빼기 버튼(44px). 서버가 사진을 받지 않으면(`uploadsEnabled`
 * false) 아무것도 그리지 않습니다. `label`은 대체 텍스트의 앞부분(안내·공지 제목)입니다.
 */
export function PhotoPicker({
  picker,
  label,
  disabled = false,
}: {
  picker: PhotoPickerState;
  label: string;
  disabled?: boolean;
}) {
  const config = usePhotoConfig();
  const ids = useId();
  const input = useRef<HTMLInputElement>(null);
  const [skipped, setSkipped] = useState(0);
  if (!config.data?.uploadsEnabled && picker.items.length === 0) return null;
  const canAdd = config.data?.uploadsEnabled === true && remainingSlots(picker.items) > 0;
  const failures = picker.items.filter((item) => item.status === "failed");

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return;
    setSkipped(await picker.add(files));
  }

  return (
    <div className="ph-picker">
      <ul className="ph-grid" aria-label={`사진 ${picker.keys.length}/${PHOTOS_MAX}`}>
        {picker.items.map((item, index) => (
          <li key={item.id} className={`ph-tile ph-tile--${item.status}`}>
            {item.status === "done" ? (
              <img
                className="ph-tile__img"
                src={item.url}
                alt={`${label} 사진 ${index + 1}`}
                width={72}
                height={72}
                decoding="async"
                onError={() => picker.broken(item.id)}
              />
            ) : item.status === "uploading" ? (
              <span
                className="ph-tile__state"
                role="img"
                aria-label={`사진 ${index + 1} 올리는 중`}
              >
                <span className="ph-spinner" aria-hidden="true" />
              </span>
            ) : (
              <span
                className="ph-tile__state"
                role="img"
                aria-label={`사진 ${index + 1} 올리지 못함`}
              >
                <Icon name="circle-alert" />
              </span>
            )}
            <button
              type="button"
              className="ph-tile__remove"
              aria-label={`사진 ${index + 1} 빼기`}
              disabled={disabled}
              onClick={() => picker.remove(item.id)}
            >
              <span className="ph-tile__remove-dot" aria-hidden="true">
                <Icon name="x" />
              </span>
            </button>
          </li>
        ))}
        {canAdd ? (
          <li className="ph-tile ph-tile--add">
            <button
              type="button"
              className="ph-add"
              aria-label={`사진 추가 (${picker.items.length}/${PHOTOS_MAX})`}
              aria-describedby={`${ids}-hint`}
              disabled={disabled}
              onClick={() => input.current?.click()}
            >
              <Icon name="image-plus" />
            </button>
            <input
              ref={input}
              className="ph-input"
              type="file"
              accept="image/*"
              multiple
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void choose(event)}
            />
          </li>
        ) : null}
      </ul>
      <p className="wh-caption ph-hint" id={`${ids}-hint`}>
        {PHOTO_PRIVACY_HINT}
      </p>
      <div aria-live="polite" className="ph-status">
        {picker.busy ? <p className="wh-caption">사진을 줄여서 올리는 중이에요</p> : null}
        {skipped > 0 ? (
          <p className="wh-caption">
            사진은 {PHOTOS_MAX}장까지라 {skipped}장은 빼고 골랐어요
          </p>
        ) : null}
      </div>
      {failures.length > 0 ? (
        <p className="wh-field-error" role="alert">
          {failures[0]?.status === "failed" ? failures[0].message : null}
        </p>
      ) : null}
    </div>
  );
}
