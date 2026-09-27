import { z } from "zod";

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
});

export const EnvSchema = EnvFields.superRefine((env, context) => {
  if (env.KAKAO_REST_API_KEY && !env.SESSION_SECRET) {
    context.addIssue({
      code: "custom",
      path: ["SESSION_SECRET"],
      message: "SESSION_SECRET is required when Kakao login is configured",
    });
  }
});

export type Env = z.infer<typeof EnvSchema>;

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
