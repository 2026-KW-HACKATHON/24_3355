import { z } from "zod";

/** 연결·‘아직 살아요’ 뒤 재확인을 요청하기까지의 기본 일수(lofi 45 ‘1년에 한 번’). 시드도 씁니다. */
export const DEFAULT_RECONFIRM_INTERVAL_DAYS = 365;

/** 빈 문자열(.env의 `KEY=`)은 값이 없는 것으로 봅니다. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

/** 키별 규칙. CLI(db:migrate 등)는 필요한 키만 `.pick()`해서 씁니다. */
export const EnvFields = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  APP_ORIGIN: z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin),
  /** 카카오 로그인 중의 짧은 쿠키(state·returnTo) 서명용. 세션 토큰과는 무관합니다. */
  SESSION_SECRET: optional(z.string().min(32)),
  KAKAO_REST_API_KEY: optional(z.string()),
  KAKAO_CLIENT_SECRET: optional(z.string()),
  KAKAO_REDIRECT_URI: optional(z.url({ protocol: /^https?$/ })),
  DEMO_MODE: z.stringbool().default(false),
  /**
   * 시연 모드에서 e2e 전용 계정(`DEMO_ACCOUNTS`의 `purpose: "e2e"`, 테스트빌라 집주인)으로도 시연 로그인할 수 있는지.
   * 이 계정은 둘러보기 전용이 아니라 테스트빌라를 바꿀 수 있어 로컬·e2e에서만 켭니다. 꺼져 있으면 그 계정의 시연
   * 로그인은 404 `NOT_FOUND`이고 `/api/dev/demo`에 e2e 건물·계정이 나오지 않습니다.
   */
  E2E_LOGIN: z.stringbool().default(false),
  /** /api/docs·/api/swagger·/api/openapi.json. 비워 두면 production이 아닐 때만 켭니다. */
  API_DOCS: optional(z.stringbool()),
  /**
   * 요청 앞의 신뢰하는 프록시 수. X-Forwarded-For의 오른쪽에서 이 번째 값을 클라이언트 IP로 봅니다.
   * 0(기본)이면 헤더를 보지 않고 소켓 주소를 씁니다(lib/client.ts).
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /**
   * 앞단(CloudFront 등)이 원 서버로 보낼 때 붙이는 `X-Origin-Verify` 헤더 값. 있으면 이 헤더가 맞는 요청에서만
   * X-Forwarded-For를 믿고, 실제 체인 모양으로 클라이언트 IP를 고릅니다(lib/client.ts `pickForwardedClient`).
   * 헤더가 없거나 틀리면 소켓 주소를 씁니다. 비우면 `TRUSTED_PROXY_HOPS` 방식입니다.
   */
  ORIGIN_VERIFY_SECRET: optional(z.string().min(32)),
  /**
   * 연결하거나 ‘아직 살아요’를 누른 뒤 재확인을 요청하기까지의 일수(backend.md §7 재확인).
   * 연결·재확인할 때 `next_reconfirm_at`에 적으므로, 바꾸면 그다음 연결·재확인부터 적용됩니다.
   */
  RECONFIRM_INTERVAL_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3650)
    .default(DEFAULT_RECONFIRM_INTERVAL_DAYS),
  /** 웹 푸시. 셋 다 있어야 켜집니다. 공개키는 브라우저에 내려가고 개인키는 서버에만 둡니다. */
  VAPID_PUBLIC_KEY: optional(z.string().min(1)),
  VAPID_PRIVATE_KEY: optional(z.string().min(1)),
  VAPID_SUBJECT: optional(z.string().regex(/^(mailto:|https:\/\/)/)),
  /**
   * 안내·공지 사진 저장소(lib/photoStore.ts). `local`은 `PHOTO_LOCAL_DIR` 폴더, `s3`는 `PHOTO_BUCKET`(자격 증명은
   * EC2 인스턴스 역할 같은 기본 체인), `off`는 사진을 받지 않음(올리기 503). 비우면 production은 `off`, 그 밖은 `local`.
   */
  PHOTO_STORE: optional(z.enum(["local", "s3", "off"])),
  PHOTO_BUCKET: optional(z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)),
  /** 저장소 안의 환경 접두사(예: `dev/`, `prod/`). 버킷 하나를 환경끼리 나눠 씁니다. 비우면 맨 위. */
  PHOTO_PREFIX: z
    .string()
    .regex(/^(?:[a-z0-9-]+\/)*$/)
    .default(""),
  /** `PHOTO_STORE=local`의 폴더. API를 실행한 폴더 기준(pnpm dev면 apps/api/.data/photos, gitignore). */
  PHOTO_LOCAL_DIR: z.string().min(1).default(".data/photos"),
  /** S3 리전. */
  AWS_REGION: z
    .string()
    .regex(/^[a-z]{2}(-[a-z]+)+-\d$/)
    .default("ap-northeast-2"),
});

const VAPID_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;

export const EnvSchema = EnvFields.superRefine((env, context) => {
  if (env.KAKAO_REST_API_KEY && !env.SESSION_SECRET) {
    context.addIssue({
      code: "custom",
      path: ["SESSION_SECRET"],
      message: "SESSION_SECRET is required when Kakao login is configured",
    });
  }
  if (env.PHOTO_STORE === "s3" && !env.PHOTO_BUCKET) {
    context.addIssue({
      code: "custom",
      path: ["PHOTO_BUCKET"],
      message: "PHOTO_BUCKET is required when PHOTO_STORE=s3",
    });
  }
  // 버킷 하나를 dev·prod가 나눠 쓰고 역할 권한도 두 접두사만 열므로, s3에서는 접두사를 꼭 정합니다.
  if (env.PHOTO_STORE === "s3" && !/^(dev|prod)\/$/.test(env.PHOTO_PREFIX)) {
    context.addIssue({
      code: "custom",
      path: ["PHOTO_PREFIX"],
      message: "PHOTO_PREFIX must be dev/ or prod/ when PHOTO_STORE=s3",
    });
  }
  const vapid = VAPID_KEYS.filter((key) => env[key] !== undefined);
  if (vapid.length > 0 && vapid.length < VAPID_KEYS.length) {
    for (const key of VAPID_KEYS.filter((key) => env[key] === undefined)) {
      context.addIssue({
        code: "custom",
        path: [key],
        message: "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT go together",
      });
    }
  }
});

export type Env = z.infer<typeof EnvSchema>;

/** 문서 화면은 외부 CDN 스크립트를 앱과 같은 출처에서 불러오므로 prod에서는 기본으로 끕니다. */
export function apiDocsEnabled(env: Env): boolean {
  return env.API_DOCS ?? env.NODE_ENV !== "production";
}

/** 사진 저장소 종류. 비우면 production은 받지 않고(off), 로컬·테스트는 폴더(local)입니다. */
export function photoStoreKind(env: Pick<Env, "PHOTO_STORE" | "NODE_ENV">): "local" | "s3" | "off" {
  return env.PHOTO_STORE ?? (env.NODE_ENV === "production" ? "off" : "local");
}

/** server.ts가 시작할 때 한 번 부릅니다. 다른 모듈은 process.env를 직접 읽지 않습니다. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    // 값은 비밀일 수 있으므로 키 이름만 알립니다.
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid environment variables: ${keys.join(", ")}`);
  }
  return result.data;
}
