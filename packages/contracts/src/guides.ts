import { z } from "zod";

/** 안내 종류. 화면 문구: 분리수거·택배·보일러·설비·공용공간·연락. DB CHECK와 같은 목록입니다. */
export const GUIDE_CATEGORIES = ["recycling", "parcel", "facility", "common", "contact"] as const;
export const GuideCategory = z.enum(GUIDE_CATEGORIES);
export type GuideCategory = z.infer<typeof GuideCategory>;

export const GUIDE_STATUSES = ["draft", "published"] as const;
export const GuideStatus = z.enum(GUIDE_STATUSES);
export type GuideStatus = z.infer<typeof GuideStatus>;

export const GUIDE_TITLE_MAX = 80;
export const GUIDE_BODY_MAX = 2000;

/** 사진 저장 위치는 정할 것. 지금은 항상 빈 배열입니다. */
export const GuidePhoto = z.object({
  url: z.string(),
  alt: z.string().optional(),
});
export type GuidePhoto = z.infer<typeof GuidePhoto>;

/** 집주인이 입력한 종류·제목·본문·사진을 그대로 담습니다(D-08). 작성자는 내보내지 않습니다. */
export const Guide = z.object({
  id: z.uuid(),
  buildingId: z.uuid(),
  category: GuideCategory,
  title: z.string(),
  body: z.string(),
  photos: z.array(GuidePhoto),
  status: GuideStatus,
  position: z.number().int(),
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
export type Guide = z.infer<typeof Guide>;

export const GuideList = z.object({ guides: z.array(Guide) });
export type GuideList = z.infer<typeof GuideList>;

export const GuideParams = z.object({ guideId: z.uuid() });
export type GuideParams = z.infer<typeof GuideParams>;

const GuideTitle = z.string().trim().min(1).max(GUIDE_TITLE_MAX);
const GuideBody = z.string().trim().min(1).max(GUIDE_BODY_MAX);

export const CreateGuideBody = z.object({
  category: GuideCategory,
  title: GuideTitle,
  body: GuideBody,
});
export type CreateGuideBody = z.infer<typeof CreateGuideBody>;

/** 초안(draft)만 고칠 수 있습니다. 보낸 필드만 바뀝니다. */
export const UpdateGuideBody = z
  .object({
    category: GuideCategory.optional(),
    title: GuideTitle.optional(),
    body: GuideBody.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one field is required",
  });
export type UpdateGuideBody = z.infer<typeof UpdateGuideBody>;

/** `buildingOpened`: 이 공개로 건물이 preparing → open이 됐는지(첫 공개). */
export const PublishGuideResult = z.object({
  guide: Guide,
  buildingOpened: z.boolean(),
});
export type PublishGuideResult = z.infer<typeof PublishGuideResult>;
