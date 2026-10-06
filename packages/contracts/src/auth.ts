import { z } from "zod";
import { Occupancy } from "./occupancies.ts";

/**
 * 로그인 뒤 돌아갈 같은 사이트 경로. `/`로 시작하고 `//`·`\\`·`#`·공백·제어문자·`.`·`..` 경로 조각,
 * 인코딩된 `/`·`\\`·제어문자는 받지 않습니다.
 */
export const ReturnTo = z
  .string()
  .max(512)
  .regex(/^\/(?![/\\])[^\\#\s\p{Cc}]*$/u)
  .refine((value) => !/(^|\/)\.{1,2}(\/|$|\?)/.test(value), "dot segments are not allowed")
  .refine(
    (value) => !/%(2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value),
    "encoded separators or controls",
  );

/**
 * 약관·개인정보 처리방침 초안의 현재 판(D-28). 판을 바꾸면 `/me`의 `termsUpToDate`가 false가 되어 웹이 다시
 * 동의를 받습니다.
 */
export const TERMS_VERSION = "2026-10-06-draft";

/**
 * 로그인할 때 함께 보내는 동의한 판. 형식만 검사하고 현재 판(`TERMS_VERSION`)과 같을 때만 계정에 남깁니다. 배포
 * 사이에 이전 판을 보낸 웹도 로그인은 되고, `/me`의 `termsUpToDate`가 false라 다시 묻게 됩니다.
 */
export const TermsConsent = z
  .string()
  .max(64)
  .regex(/^[0-9A-Za-z][0-9A-Za-z._-]*$/);

/**
 * `consent`: 로그인 전에 동의를 받았으면 그 판. 우리 화면에서 시작한 요청(`Sec-Fetch-Site: same-origin`, 이 헤더가
 * 없으면 `Origin`·`Referer`가 앱 출처)일 때만 서명한 로그인 쿠키에 담았다가 콜백에서 계정에 남깁니다. 다른 사이트의
 * 링크로 들어오면 로그인만 하고 동의는 남기지 않습니다.
 */
export const KakaoStartQuery = z.object({
  returnTo: ReturnTo.optional(),
  consent: TermsConsent.optional(),
});
export type KakaoStartQuery = z.infer<typeof KakaoStartQuery>;

/**
 * `POST /api/auth/logout` 본문(없어도 됨). `pushEndpoint`: 이 브라우저의 알림 구독 주소. 보내면 로그아웃하면서 내 그
 * 구독을 서버에서도 지웁니다(다른 사람이 이 기기로 로그인해도 내 알림이 오지 않게). 알려진 푸시 서비스 주소
 * (`isAllowedPushEndpoint`)가 아니면 지우지 않고 로그아웃만 합니다.
 */
export const LogoutBody = z.object({ pushEndpoint: z.string().min(1).max(2048).optional() });
export type LogoutBody = z.infer<typeof LogoutBody>;

/** 로그인한 채로 새 판에 동의(판이 바뀌어 다시 물었을 때). 현재 판이 아니면 409 `CONFLICT`입니다. */
export const TermsConsentBody = z.object({ version: TermsConsent });
export type TermsConsentBody = z.infer<typeof TermsConsentBody>;

/** 로그인에 실패하거나 취소하면 `returnTo`에 붙는 쿼리: `?login=cancelled` 또는 `?login=failed`. */
export const LOGIN_RESULT_PARAM = "login";
export const LOGIN_RESULTS = ["cancelled", "failed"] as const;
export const LoginResult = z.enum(LOGIN_RESULTS);
export type LoginResult = z.infer<typeof LoginResult>;

/** 살아 있는 연결(active·reconfirm_needed)과 건물 이름. 사용자마다 하나이고, 없으면 null입니다. */
export const MeOccupancy = Occupancy.extend({ buildingName: z.string() });
export type MeOccupancy = z.infer<typeof MeOccupancy>;

/**
 * `termsVersion`·`termsAgreedAt`: 마지막으로 동의한 약관 판과 시각(기록이 없으면 null). `termsUpToDate`: 지금 판
 * (`TERMS_VERSION`)에 동의했는지. false여도 세션·기능은 막지 않고, 웹이 다시 동의를 받습니다(D-28).
 */
export const Me = z.object({
  user: z.object({
    id: z.uuid(),
    termsVersion: z.string().nullable(),
    termsAgreedAt: z.iso.datetime().nullable(),
    termsUpToDate: z.boolean(),
  }),
  managedBuildings: z.array(z.object({ id: z.uuid(), name: z.string() })),
  occupancy: MeOccupancy.nullable(),
});
export type Me = z.infer<typeof Me>;

/**
 * 시연 모드(DEMO_MODE=true)에서만 열리는 로그인. 시드된 시연 사용자만 고를 수 있습니다.
 * 집주인, 햇살빌라에 연결된 입주자 A, 아직 연결하지 않은 다음 입주자 B, 그리고 끝까지 해보는 테스트(e2e)
 * 전용 건물 ‘테스트빌라’만 관리하는 집주인(e2e가 햇살빌라를 바꾸지 않도록).
 */
export const DEMO_USERS = [
  "demo-landlord",
  "demo-resident-a",
  "demo-resident-b",
  "demo-e2e-landlord",
] as const;
export const DemoUser = z.enum(DEMO_USERS);
export type DemoUser = z.infer<typeof DemoUser>;
/**
 * `consent`: 현재 판일 때만 계정에 남깁니다. JSON POST라 다른 사이트는 보낼 수 없습니다(CORS 사전 요청, 폼 형식은
 * CSRF 403).
 */
export const DevLoginBody = z.object({ as: DemoUser, consent: TermsConsent.optional() });
export type DevLoginBody = z.infer<typeof DevLoginBody>;

/**
 * 시연 모드 전용 `GET /api/dev/whoami`: 요청한 사람 자신의 X-Forwarded-For와 서버가 고른 클라이언트 주소.
 * 배포 뒤 실제 프록시 체인을 재려고 둡니다. 비밀 헤더 값은 담지 않고 일치 여부만 담습니다. 로그에는 남기지 않습니다.
 */
export const DevWhoami = z.object({
  forwardedFor: z.array(z.string()),
  socketAddress: z.string(),
  clientAddress: z.string(),
  mode: z.enum(["origin-verify", "proxy-hops", "socket"]),
  originVerify: z.enum(["matched", "missing", "mismatch", "not_configured"]),
});
export type DevWhoami = z.infer<typeof DevWhoami>;
