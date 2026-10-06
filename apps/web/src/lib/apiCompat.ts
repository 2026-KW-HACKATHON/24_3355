import type { StandardSchemaV1, StandardSchemaV1InferOutput } from "ky";

// 이전 API와 함께 도는 배포 한 번 동안만 쓰는 너그러운 파싱(웹이 API보다 먼저 배포될 수 있음, D-28·LF-12 23).
// contracts 스키마는 그대로 두고, 이전 API에 없던 필드만 채운 뒤 같은 스키마로 검사합니다. 새 API가 dev·prod에
// 모두 배포되면 이 파일과 부르는 곳을 지웁니다(docs/frontend.md §2).

/** 확인 시각을 모르는(이전 API) 건물. 웹은 `confirmedAt !== null`만 보므로 확인한 건물로 다룹니다. */
export const CONFIRMED_AT_UNKNOWN = "1970-01-01T00:00:00.000Z";

type Output<S extends StandardSchemaV1> = StandardSchemaV1InferOutput<S>;

/** `fill`로 빠진 필드를 채운 뒤 `schema`로 검사하는 스키마. getJson·postJson에 그대로 넘깁니다. */
export function tolerant<S extends StandardSchemaV1>(
  schema: S,
  fill: (value: unknown) => unknown,
): StandardSchemaV1<unknown, Output<S>> {
  type Validate = StandardSchemaV1<unknown, Output<S>>["~standard"]["validate"];
  return {
    "~standard": {
      version: 1,
      vendor: "wolgyeham-compat",
      validate: (value) => schema["~standard"].validate(fill(value)) as ReturnType<Validate>,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `/api/me`·시연 로그인·약관 동의 응답의 `user`에 약관 필드가 없으면(이전 API) 판·시각은 null, 동의 여부는
 * 모르므로 다시 동의 시트를 띄우지 않게 `termsUpToDate: true`로 채웁니다.
 */
export function fillMeTerms(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value["user"])) return value;
  const user = value["user"];
  if ("termsUpToDate" in user) return value;
  return {
    ...value,
    user: {
      ...user,
      termsVersion: user["termsVersion"] ?? null,
      termsAgreedAt: user["termsAgreedAt"] ?? null,
      termsUpToDate: true,
    },
  };
}

/** 관리 건물 하나에 `confirmedAt`이 없으면(이전 API) 확인한 건물로 채웁니다(23을 다시 띄우지 않음). */
export function fillConfirmedAt(value: unknown): unknown {
  if (!isRecord(value) || "confirmedAt" in value) return value;
  return { ...value, confirmedAt: CONFIRMED_AT_UNKNOWN };
}

/** `GET /manage/buildings/:id`(건물 + 안내). */
export function fillManagedDetail(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return { ...value, building: fillConfirmedAt(value["building"]) };
}

/** `GET /manage/buildings`(관리 건물 목록). */
export function fillManagedList(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value["buildings"])) return value;
  return { ...value, buildings: value["buildings"].map(fillConfirmedAt) };
}
