import { useQuery } from "@tanstack/react-query";
import { PhotoConfig, UploadPhotoResult } from "@wolgyeham/contracts";
import { getJson, postForm, seg } from "../../lib/api";

export const photoKeys = { config: () => ["photos", "config"] as const };

/** 서버가 사진을 받는지(`uploadsEnabled`). 받지 않으면 사진 추가를 숨깁니다. */
export function usePhotoConfig() {
  return useQuery({
    queryKey: photoKeys.config(),
    queryFn: () => getJson("/api/photos/config", PhotoConfig),
    staleTime: 10 * 60 * 1000,
  });
}

/** 사진 하나를 올립니다(집주인). 아직 어떤 안내·공지에도 붙지 않은 사진이라 집주인만 봅니다. */
export async function uploadPhoto(buildingId: string, image: Blob) {
  const form = new FormData();
  form.append("file", image, "photo.jpg");
  const result = await postForm(
    `/api/buildings/${seg(buildingId)}/photos`,
    form,
    UploadPhotoResult,
  );
  return result.photo;
}
