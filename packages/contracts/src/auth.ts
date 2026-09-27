import { z } from "zod";

/** 로그인 뒤 돌아갈 같은 사이트 경로. `/`로 시작하고 `//`·`\`·`#`은 받지 않습니다. */
export const ReturnTo = z
  .string()
  .max(512)
  .regex(/^\/(?![/\\])[^\\#\s]*$/);

export const KakaoStartQuery = z.object({ returnTo: ReturnTo.optional() });
export type KakaoStartQuery = z.infer<typeof KakaoStartQuery>;

/** 로그인에 실패하거나 취소하면 `returnTo`에 붙는 쿼리: `?login=cancelled` 또는 `?login=failed`. */
export const LOGIN_RESULT_PARAM = "login";
export const LOGIN_RESULTS = ["cancelled", "failed"] as const;
export const LoginResult = z.enum(LOGIN_RESULTS);
export type LoginResult = z.infer<typeof LoginResult>;

export const Me = z.object({
  user: z.object({ id: z.uuid() }),
  managedBuildings: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type Me = z.infer<typeof Me>;

/** 시연 모드(DEMO_MODE=true)에서만 열리는 로그인. 시드된 시연 사용자만 고를 수 있습니다. */
export const DEMO_USERS = ["demo-landlord"] as const;
export const DevLoginBody = z.object({ as: z.enum(DEMO_USERS) });
export type DevLoginBody = z.infer<typeof DevLoginBody>;
