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

/**
 * 보낸 필드만 바뀝니다. 초안(draft)은 그대로 고치고, 공개된 안내는 공개 내용을 두고 수정본(`GuideRevision`)에
 * 저장합니다. 수정본은 `POST /guides/:guideId/publish`(수정 공개)를 해야 공개 내용이 됩니다.
 */
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

/** 공개된 안내의 아직 공개하지 않은 수정본. 안내마다 하나이고 집주인만 봅니다. */
export const GuideRevision = z.object({
  guideId: z.uuid(),
  category: GuideCategory,
  title: z.string(),
  body: z.string(),
  savedAt: z.iso.datetime(),
});
export type GuideRevision = z.infer<typeof GuideRevision>;

/** `GET /guides/:guideId/revision`(집주인). 저장한 수정본이 없으면 null입니다. */
export const GuideRevisionResponse = z.object({ revision: GuideRevision.nullable() });
export type GuideRevisionResponse = z.infer<typeof GuideRevisionResponse>;

/**
 * 집주인이 고친 뒤 받는 안내(`PATCH /guides/:guideId`). 위 필드는 지금 공개된(초안이면 초안) 내용이고,
 * 공개된 안내를 고쳤으면 저장한 수정본이 `revision`에 있습니다. 초안은 항상 null입니다.
 */
export const ManagedGuide = Guide.extend({ revision: GuideRevision.nullable() });
export type ManagedGuide = z.infer<typeof ManagedGuide>;

/** 한 번에 반영할 수 있는 메모 수. */
export const APPLY_MEMO_IDS_MAX = 50;

/**
 * 공개(43)와 수정 공개. `applyMemoIds`는 이 안내의 확인 전(`pending`) 메모 중 이번 수정으로 반영하는 것이고,
 * 공개와 같은 트랜잭션에서 `applied`가 됩니다. 본문을 보내지 않으면 빈 목록입니다.
 */
export const PublishGuideBody = z.object({
  applyMemoIds: z.array(z.uuid()).max(APPLY_MEMO_IDS_MAX).default([]),
});
export type PublishGuideBody = z.infer<typeof PublishGuideBody>;

/**
 * `buildingOpened`: 이 공개로 건물이 preparing → open이 됐는지(첫 공개).
 * `appliedMemoIds`: 이 공개로 `applied`가 된 메모.
 */
export const PublishGuideResult = z.object({
  guide: Guide,
  buildingOpened: z.boolean(),
  appliedMemoIds: z.array(z.uuid()),
});
export type PublishGuideResult = z.infer<typeof PublishGuideResult>;
