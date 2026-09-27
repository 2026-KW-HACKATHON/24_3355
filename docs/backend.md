# 백엔드 개발 가이드

`apps/api`에 엔드포인트를 만들거나 고칠 때 따르는 구조와 규칙입니다. 새 API는 이 문서에 나온 순서와 형식으로 만듭니다.

기준: [lofi/screens.md 개발 계약 초안](../lofi/screens.md#개발-계약-초안), `packages/contracts` · 담당 영역: 백엔드 `apps/api`, 공통 계약 `packages/contracts` ([CONTRIBUTING.md §2](../CONTRIBUTING.md#2-담당-영역))

함께 읽기: [database.md](database.md) · [architecture.md](architecture.md) · [frontend.md](frontend.md) · [deploy.md](deploy.md) · [decisions.md](decisions.md)

## 1. 현재 상태

| 항목 | 상태 |
|---|---|
| `GET /api/health` (프로세스 응답만 확인하고 DB는 보지 않음) | 있음 |
| `/api/openapi.json` 스펙, `/api/swagger` (Swagger UI), `/api/docs` (Scalar) | 있음. 로컬은 `http://127.0.0.1:3001/api/swagger` |
| `{ "error": { "code": "NOT_FOUND" } }` 404, `INTERNAL_ERROR` 500 | 있음 (`app.ts`) |
| 환경 변수 파싱 (`lib/env.ts`), `lib/`, DB (Drizzle), 세션, 카카오 로그인 | 있음 (구현 순서 A) |
| `modules/` buildings·guides·notices(현재 공지)·manage·me·auth | 있음 (구현 순서 A). 아래 표 |
| 가입코드·연결·수정 메모·공지 작성·제보·팁, `requireOccupancy`, 웹 푸시 | 아직 구현 전 |

구현 순서 A(초대 → 안내 작성·공개 → 비회원이 공개 화면에서 읽기)의 경로입니다. 요청·응답 스키마는 `packages/contracts`와 `/api/swagger`가 기준입니다.

| 경로 (`/api` 생략) | 누가 | 응답 |
|---|---|---|
| `GET /buildings/:buildingId` | 누구나 | 건물(이름·도로명 주소·상태). preparing도 돌려줌, 없으면 404 |
| `GET /buildings/:buildingId/guides` | 누구나 | 공개된 안내만 `position` 순 |
| `GET /guides/:guideId` | 누구나 / 초안은 그 건물 집주인 | 볼 수 없는 초안은 404 |
| `GET /buildings/:buildingId/notices/current` | 누구나 | 끝나지 않은 공지 중 가장 최근 것 또는 `null` |
| `GET /manage/buildings`, `GET /manage/buildings/:buildingId` | 집주인 | 관리하는 건물(팀 확인 주소 포함)과 안내 개수 / 초안 포함 전체 안내 |
| `POST /buildings/:buildingId/guides`, `PATCH /guides/:guideId` | 집주인 | 초안 만들기·고치기. 공개된 안내 수정은 409 (구현 순서 C에서 정할 것) |
| `POST /guides/:guideId/publish` | 집주인 | 공개 + 첫 공개면 건물 open, `buildingOpened` |
| `POST /manager-invites/preview`, `POST /manager-invites/accept` | 누구나 / 로그인 | 초대받은 건물 이름 / 수락 |
| `GET /me`, `POST /auth/logout`, `GET /auth/kakao/start`, `GET /auth/kakao/callback` | — | §5 |
| `GET·POST /dev/login` | 시연 모드만 | §6. `DEMO_MODE=true`가 아니면 경로가 없어 404 |

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed   # 로컬 DB 준비 (database.md)
pnpm dev:api   # API만 실행 (127.0.0.1:3001). apps/api/.env가 있으면 읽음
pnpm dev       # 웹(5173)과 API를 함께 실행. 웹의 /api 요청은 Vite 프록시가 API로 넘김
pnpm test      # 루트에서 vitest run (DB 테스트는 wolgyeham_test, §10)
```

## 2. 구조

Hono 4 앱 하나를 Node 24 프로세스 하나(`@hono/node-server`)로 실행하고, 모든 경로를 `/api` 아래에 둡니다.

```text
apps/api/src/
├─ app.ts               createApp(): 라우터 조립, 문서 경로, notFound·onError
├─ server.ts            env 파싱, 서버 실행, 종료 처리
├─ lib/
│  ├─ env.ts            zod로 파싱한 환경 변수
│  ├─ db.ts             Drizzle 클라이언트 (database.md)
│  ├─ auth.ts           세션 읽기, requireUser·requireManager·requireOccupancy
│  ├─ errors.ts         AppError, 검증 실패 변환, 오류 응답 문서화
│  ├─ context.ts        Hono 환경 타입 AppEnv (db·env·user·requestId)
│  └─ log.ts            JSON 한 줄 로거
├─ db/
│  ├─ schema.ts         Drizzle 스키마
│  ├─ migrate.ts        마이그레이션 실행 (이미지에서는 migrate.mjs)
│  ├─ seed.ts           시연 데이터 (db:seed)
│  └─ invite.ts         집주인 초대 발급 (db:invite)
├─ test/helpers.ts      테스트 DB 연결과 픽스처
└─ modules/<domain>/
   ├─ routes.ts         HTTP만: describeRoute, validator, 서비스 호출, 응답
   ├─ service.ts        업무 규칙, 권한 확인, 상태 전이, 트랜잭션
   ├─ repo.ts           Drizzle 쿼리
   └─ *.test.ts
```

| 계층 | 하는 일 | 하지 않는 일 |
|---|---|---|
| `routes.ts` | 입력 검증, 세션에서 사용자 꺼내기, 서비스 호출, 상태 코드 결정 | DB 접근, 권한 판단 |
| `service.ts` | `require*` 권한 확인, 상태 전이, 트랜잭션, `AppError` 던지기 | Hono `Context` 사용 |
| `repo.ts` | 쿼리, DB 행(snake_case) ↔ 계약 객체(camelCase) 변환 | 권한·상태 규칙 |

- 다른 모듈의 데이터가 필요하면 그 모듈의 `service.ts`를 부릅니다. 남의 `repo.ts`를 직접 가져오지 않습니다. 여러 모듈을 묶는 화면(관리 홈)은 `modules/manage`가 두 서비스를 부릅니다.
- 서비스·repo 함수는 첫 인자로 `Database`(라우트의 `c.var.db` 또는 트랜잭션 `tx`)를 받습니다. `createApp({ env, db })`가 요청마다 `c.var.env`·`c.var.db`를 넣습니다.
- 프론트엔드는 `apps/api` 코드를 가져오지 않고 `@wolgyeham/contracts`만 씁니다.

| 모듈 | 다루는 것 | 경로 초안 (`/api` 생략, 계약에서 확정) |
|---|---|---|
| `auth` | 카카오 로그인, 세션 | `GET /auth/kakao/start`, `GET /auth/kakao/callback`, `POST /auth/logout` |
| `me` | 내 정보, 보낸 내용, 내 팁 | `GET /me`, `GET /me/reports`, `GET /me/tips` |
| `buildings` | 건물, 집주인 초대·관리자, 가입코드 | `GET·PATCH /buildings/:buildingId`, `POST /manager-invites/accept`, `GET·POST /buildings/:buildingId/join-code`, `POST /buildings/:buildingId/join-code/check` |
| `guides` | 기본 안내, 수정 메모 | `GET·POST /buildings/:buildingId/guides`, `GET·PATCH /guides/:guideId`, `POST /guides/:guideId/publish`, `POST /guides/:guideId/correction-memos`, `GET /buildings/:buildingId/correction-memos`, `POST /correction-memos/:memoId/keep` |
| `notices` | 공지, 발송 기록, 푸시 구독 | `POST /buildings/:buildingId/notices`, `GET /notices/:noticeId`, `POST·DELETE /push-subscriptions` |
| `occupancies` | 연결, 재확인, 이사 | `POST /buildings/:buildingId/occupancies`, `POST /occupancies/:occupancyId/reconfirm`, `POST /occupancies/:occupancyId/move-out` |
| `reports` | 제보, 비회원 조회 토큰 | `GET·POST /buildings/:buildingId/reports`, `GET /reports/:reportId`, `POST /reports/:reportId/acknowledge`, `POST /reports/:reportId/resolve` |
| `tips` | 생활 팁, 콘텐츠 신고 | `GET·POST /buildings/:buildingId/tips`, `PATCH·DELETE /tips/:tipId`, `POST /tips/:tipId/content-reports` |

- 경로는 복수형 명사로 씁니다. 상태 전이는 `POST /<자원>/:id/<동작>`으로 만듭니다(`publish`, `acknowledge`, `reconfirm`, `move-out`). 상태를 바꾸는 요청을 GET으로 만들지 않습니다.
- 경로의 ID는 uuid이며 `z.uuid()`로 검증합니다. 공개 건물 URL도 `buildings.id`를 씁니다.
- JSON 필드는 camelCase, 날짜는 ISO 8601 문자열(`z.iso.datetime()`)입니다.
- 웹 URL(`/b/:buildingId`, `/r/:reportId#t=`, `/invite#t=`)은 [frontend.md §4](frontend.md#4-라우트-결정)를 따릅니다. 토큰은 웹 URL의 `#` 뒤에만 두고, 웹이 헤더(`X-Report-Token`)나 요청 본문(`POST /manager-invites/accept`)으로 API에 보냅니다. API 경로와 쿼리에 초대 토큰을 받지 않습니다.

## 3. 엔드포인트를 추가하는 순서

1. **계약:** `packages/contracts/src/<domain>.ts`에 요청·응답 zod 스키마와 `z.infer` 타입, 새 오류 코드를 추가하고 `index.ts`에서 export합니다.
2. **백엔드:** `repo.ts` → `service.ts` → `routes.ts` → 테스트 순서로 구현하고 `app.ts`에 `app.route("/api", ...)`로 붙입니다.
3. **프론트엔드:** 같은 스키마로 요청·응답을 다룹니다([frontend.md](frontend.md)).
4. 필드 삭제, 이름 변경, 선택 → 필수처럼 계약을 깨는 변경은 웹과 API를 같은 PR에서 고칩니다.

```ts
// packages/contracts/src/guides.ts
import { z } from "zod";

export const GUIDE_STATUSES = ["draft", "published"] as const; // DB CHECK와 같은 목록
export const GuideStatus = z.enum(GUIDE_STATUSES);
export const Guide = z.object({
  id: z.uuid(),
  buildingId: z.uuid(),
  title: z.string().min(1),
  body: z.string(),
  status: GuideStatus,
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
export type Guide = z.infer<typeof Guide>;

export const GuideParams = z.object({ guideId: z.uuid() });
export const PublishGuideBody = z.object({ applyMemoIds: z.array(z.uuid()).default([]) });
export type PublishGuideBody = z.infer<typeof PublishGuideBody>;
```

타입은 스키마와 같은 이름으로 export합니다. 요청·응답 스키마에는 `...Params`, `...Query`, `...Body` 접미사를 붙입니다.

```ts
// apps/api/src/modules/guides/routes.ts (import 생략)
export const guideRoutes = new Hono<AppEnv>().post(
  "/guides/:guideId/publish",
  describeRoute({
    tags: ["guides"],
    summary: "안내 공개 (집주인)",
    responses: {
      200: {
        description: "공개한 안내",
        content: { "application/json": { schema: resolver(Guide) } },
      },
      ...errorResponses(400, 401, 403, 404, 409),
    },
  }),
  validator("param", GuideParams, onInvalid),
  validator("json", PublishGuideBody, onInvalid),
  async (c) => {
    const user = requireUser(c);
    const { guideId } = c.req.valid("param");
    return c.json(await guideService.publish(c.var.db, user.id, guideId, c.req.valid("json")), 200);
  },
);
```

- 모든 라우트에 `describeRoute`로 `tags`, `summary`, 성공 응답 스키마, 발생 가능한 오류 상태를 적습니다. 이것이 빠지면 Swagger에 입력·응답이 나오지 않습니다.
- 입력(`param`, `query`, `json`)은 `hono-openapi`의 `validator`로 경계에서 검증하고, 실패 처리는 `onInvalid` 하나로 통일합니다. `errorResponses(...상태)`는 상태마다 `ErrorResponse` 스키마를 붙이는 `lib/errors.ts`의 헬퍼입니다.
- PR 전에 `/api/swagger`에서 새 경로와 스키마를 확인합니다.

## 4. 오류 응답

```json
{ "error": { "code": "UPPER_SNAKE_CASE", "message": "선택", "fields": { "path": "선택" } } }
```

| HTTP | 대표 `code` | 쓰는 때 |
|---|---|---|
| 400 | `VALIDATION_FAILED` | 입력 검증 실패. `fields`에 필드 경로별 사유 |
| 401 | `UNAUTHENTICATED` | 세션 없음·만료 |
| 403 | `FORBIDDEN`, `NOT_BUILDING_MANAGER`, `NOT_CONNECTED`, `RECONFIRM_NEEDED` | 로그인은 했지만 이 건물과의 관계가 없거나 멈춤 |
| 404 | `NOT_FOUND` | 없음. 볼 권한이 없는 대상의 존재를 숨길 때도 씀 (다른 사람의 초안, 틀린 제보 토큰) |
| 409 | `CONFLICT`, `JOIN_CODE_INVALID` | 이미 상태가 바뀜(조건부 UPDATE 0건), 가입코드 불일치 |
| 410 | `REPORT_LINK_EXPIRED`, `NOTICE_ENDED`, `INVITE_EXPIRED` | 기간이 지남 |
| 429 | `RATE_LIMITED`, `JOIN_CODE_LOCKED`, `REPORT_TOO_FREQUENT` | 반복 제한. `Retry-After` 헤더를 붙임 |
| 500 | `INTERNAL_ERROR` | 예상하지 못한 오류. 원인은 로그에만 남김 |

- 코드는 contracts의 `ErrorCode` zod enum 하나에서 관리하고, 응답 스키마는 `ErrorResponse`입니다(`packages/contracts/src/errors.ts`). 새 코드는 계약에 먼저 추가합니다. 카카오 키가 없는 환경의 로그인 요청은 503 `KAKAO_NOT_CONFIGURED`입니다.
- 프론트엔드는 HTTP 상태가 아니라 `code`로 분기해 한국어 문구를 고릅니다. API는 사용자에게 보일 한국어 문장을 유일한 신호로 보내지 않습니다. `message`는 개발자용 설명이고 화면에 쓰지 않습니다.
- 서비스는 `throw new AppError(403, "NOT_BUILDING_MANAGER")`로 끝냅니다. `AppError(status, code, fields?)`는 `lib/errors.ts`에 두고, `app.onError`가 응답 모양을 만듭니다.

```ts
// apps/api/src/app.ts
app.onError((error, c) => {
  if (error instanceof AppError) {
    const body = error.fields ? { code: error.code, fields: error.fields } : { code: error.code };
    return c.json({ error: body }, error.status);
  }
  log("error", "request_failed", { requestId: c.get("requestId"), name: error.name });
  return c.json({ error: { code: "INTERNAL_ERROR" } }, 500);
});
```

`onInvalid(result)`는 `result.success`가 false일 때 이슈마다 `path.join(".")`를 키, 이슈 메시지를 값으로 모아 `AppError(400, "VALIDATION_FAILED", fields)`를 던집니다. 응답 예: `{"error":{"code":"VALIDATION_FAILED","fields":{"applyMemoIds.0":"Invalid UUID"}}}`.

## 5. 로그인과 세션

카카오 로그인(OAuth 2.0 인가 코드 방식)은 서버가 처리합니다. 웹에는 콜백 화면이 없습니다.

1. 웹이 `GET /api/auth/kakao/start?returnTo=<경로>`로 이동합니다. API는 `state`를 만들어 짧은 수명(10분)의 HttpOnly 쿠키에 `returnTo`와 함께 넣고 `SESSION_SECRET`으로 서명한 뒤(`hono/cookie`의 `setSignedCookie`) 카카오 인가 주소로 302 응답합니다. `returnTo`는 `/`로 시작하는 같은 사이트 경로만 받습니다(`//`로 시작하면 거부).
2. 카카오가 `GET /api/auth/kakao/callback?code&state`로 돌려보냅니다. API는 `state`를 확인하고 코드를 토큰으로 바꾼 뒤 카카오 회원번호만 조회합니다. 카카오 액세스 토큰은 저장하지 않습니다.
3. `users`를 upsert하고 세션을 만든 뒤 `APP_ORIGIN + returnTo`로 302 응답합니다. 사용자가 취소하면 `?login=cancelled`, state 불일치·카카오 오류면 `?login=failed`를 붙여 `returnTo`로 보냅니다(contracts `LOGIN_RESULT_PARAM`, `LOGIN_RESULTS`). state 쿠키가 없으면 `/`로 보냅니다.

| 세션 쿠키 `wh_session` | 값 |
|---|---|
| 값 | 32바이트 난수(base64url). DB `sessions`에는 SHA-256 해시만 저장 |
| 속성 | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure`(`APP_ORIGIN`이 `https://`일 때. 로컬 http만 제외) |
| 수명 | 30일. 사용할 때 연장(rolling)하고, 연장 쓰기는 하루 한 번 이하 |
| 로그아웃 | `POST /api/auth/logout`: 세션 행 삭제 + 쿠키 삭제 |

- 웹과 API는 모든 환경에서 같은 출처입니다. 로컬은 Vite 프록시, 배포 환경은 Amplify의 `/api/*` rewrite가 API로 넘깁니다([deploy.md](deploy.md)). 그래서 CORS 설정을 두지 않고 쿠키는 1st-party입니다.
- 브라우저 주소, `APP_ORIGIN`, `KAKAO_REDIRECT_URI`의 호스트를 맞춥니다. `localhost`와 `127.0.0.1`은 쿠키가 따로 저장됩니다.
- **카카오 로그인은 거주를 증명하지 않습니다.** 거주 관계는 가입코드로 만든 `occupancies`만 봅니다.

## 6. 권한

권한은 로그인 여부가 아니라 이 건물과의 관계로 판단하고, 요청마다 서비스에서 확인합니다. 버튼을 숨기는 것으로 대신하지 않습니다. 행동별 허용 범위는 [screens.md §1 권한](../lofi/screens.md#1-권한) 표를 따릅니다.

| 헬퍼 (`lib/auth.ts`) | 통과 조건 | 실패 |
|---|---|---|
| `requireUser(c)` | 유효한 세션 | 401 `UNAUTHENTICATED` |
| `requireManager(db, userId, buildingId)` | `building_managers`에 행이 있음 | 403 `NOT_BUILDING_MANAGER` |
| `requireOccupancy(userId, buildingId, { allow })` (아직 구현 전) | 연결 상태가 `allow` 안에 있음 | 403 `NOT_CONNECTED`(연결 없음·`inactive`), `RECONFIRM_NEEDED`(`reconfirm_needed`인데 허용 안 됨) |

- `allow: ["active"]`: 팁·메모 쓰기, 공지 알림 구독.
- `allow: ["active", "reconfirm_needed"]`: 팁·메모 읽기, 본인 팁 고치기·지우기, 팁 신고. 집주인은 `requireManager`로 따로 허용합니다.
- `buildingId`는 요청 경로를 믿지 않고 대상 자원에서 꺼냅니다. `/guides/:guideId`라면 `guide.buildingId`로 확인합니다.
- 집주인 권한은 팀이 발급한 `manager_invites`를 수락했을 때만 생깁니다. 지금은 팀이 스크립트로 발급합니다: `pnpm --filter @wolgyeham/api db:invite <buildingId> [유효 일수]`가 `${APP_ORIGIN}/invite#t=<토큰>`을 한 번만 출력하고 DB에는 해시만 저장합니다. 유효 기간(기본 7일), 건물 등록 방법, 운영자(LF-19) 권한 모델은 정할 것입니다.
- 시연 모드(LF-20)는 dev·데모 데이터에서만 엽니다. 역할 전환은 시드된 시연 사용자로 바꾸는 것일 뿐 실제 권한을 만들지 않습니다.
- **시연 로그인 (dev·시연 전용):** 환경 변수 `DEMO_MODE=true`일 때만 `app.ts`가 `GET /api/dev/login`(쓸 수 있으면 204, 부작용 없음)과 `POST /api/dev/login`(`{ "as": "demo-landlord" }` → 시드된 시연 집주인 세션)을 붙입니다. 꺼져 있으면 경로 자체가 없어 404입니다. 시연 집주인은 시연 건물(햇살빌라)만 관리합니다. prod는 `DEMO_MODE=false`로 둡니다.

## 7. 도메인 규칙

상태 이름과 전이는 [screens.md §3 상태 전이](../lofi/screens.md#3-상태-전이)가 기준입니다. 여기에는 구현할 때 지킬 것만 적습니다.

- **상태 전이:** `UPDATE ... WHERE id = ? AND status = '<이전 상태>'`로 바꾸고, 0건이면 409 `CONFLICT`입니다. 조회만으로 상태를 바꾸지 않습니다(제보 `acknowledged`는 버튼 요청으로만).
- **안내 공개:** `POST /guides/:guideId/publish` 한 번이 트랜잭션 하나입니다. 안내를 `published`로 바꾸고, 건물의 첫 공개면 `buildings.status`를 `preparing` → `open`으로 바꾸고, `applyMemoIds`의 메모를 `pending` → `applied`로 바꿉니다. 하나라도 실패하면 모두 되돌려 메모는 `pending`으로 남습니다. 기존 유지는 `POST /correction-memos/:memoId/keep`에 사유를 필수로 받습니다.
- **초대 수락:** `POST /manager-invites/accept`는 로그인이 필요하고, 본문의 토큰을 SHA-256으로 해시해 `manager_invites`에서 찾습니다. 만료는 410 `INVITE_EXPIRED`, 없거나 이미 수락된 초대는 404입니다. 수락과 `building_managers` 생성은 한 트랜잭션입니다. 이미 그 건물 관리자면 초대 상태를 바꾸지 않고 성공으로 응답합니다(웹은 관리 홈으로 이동, [screens.md §5](../lofi/screens.md#5-들어온-경로별-첫-화면)).
- **연결:** 가입코드(1/2)는 로그인 전에 받으므로 `join-code/check`로 먼저 확인하고, 로그인 뒤 `POST /buildings/:buildingId/occupancies`에서 코드를 다시 확인하고 연결합니다. 5회 틀리면 10분 동안 429 `JOIN_CODE_LOCKED`입니다. 횟수를 세는 기준(사용자·브라우저·IP)과 코드 정규화 규칙은 정할 것입니다. 다른 건물로 옮길 때는 기존 연결 종료와 새 연결을 한 트랜잭션에서 처리하고, 실패하면 기존 연결을 유지합니다.
- **공지:** 게시 트랜잭션에서 `notices`와 `notice_deliveries`(대상 = 발송 시점에 `active`이고 푸시 구독이 있는 거주자)를 만들고, 커밋한 뒤 발송을 시도해 `attempted_at`을 기록합니다. 응답은 `attemptedCount`만 돌려주고 도착·열람을 단정하지 않습니다. 기간이 끝난 공지는 공개 목록에서 빼고 상세는 410 `NOTICE_ENDED`입니다.
- **웹 푸시 (아직 구현 전):** VAPID와 `web-push` 라이브러리를 씁니다. 개인키는 서버 환경 변수에만 두고, 브라우저 구독에 필요한 공개키는 API가 내려줍니다(경로는 계약에서 정할 것). 푸시 서비스가 404·410을 돌려준 구독은 지웁니다.
- **제보:** 생성할 때 32바이트 난수 토큰을 만들어 응답에 한 번만 담고(`accessToken`), DB에는 SHA-256 해시와 만료 시각(30일)만 저장합니다. 조회는 보낸 계정, 그 건물 집주인, 또는 `X-Report-Token` 헤더의 유효한 토큰으로(쿼리로는 받지 않음. 주소는 로그에 남기 때문) `GET /reports/:reportId`에서 합니다. 그 건물 집주인은 제보를 보낼 수 없습니다(403 `FORBIDDEN`). 만료는 410 `REPORT_LINK_EXPIRED`, 없거나 틀린 토큰은 404입니다. 공개 QR 주소만으로 제보한 사람을 식별하지 않고, 비회원 때 보낸 제보를 나중에 로그인한 계정에 붙이지 않습니다.
- **반복 접수 제한:** 같은 클라이언트(토큰이 없으면 IP 기준)가 같은 건물에 같은 문구를 짧은 간격으로 다시 보내면 429 `REPORT_TOO_FREQUENT`입니다. 간격·횟수와 카운터 저장 위치는 정할 것입니다.

## 8. 로그

- 이벤트마다 JSON 한 줄을 남깁니다: `{ level, event, time, requestId, ... }`.
- `app.use(requestId())`(`hono/request-id`)로 요청 ID를 정합니다. 들어온 `X-Request-Id`가 있으면 그대로 쓰고, 없으면 UUID를 만들며, 응답 헤더에도 붙입니다.
- 요청 로그(`event: "request"`, 테스트에서는 끔)에는 등록된 경로 패턴(`hono/route`의 `routePath(c, -1)`, 예: `/api/reports/:reportId`)을 남깁니다. 실제 URL과 쿼리는 토큰이 섞일 수 있으므로 남기지 않습니다.
- `/api` 응답에는 모두 `Cache-Control: no-store`를 붙입니다. 문서 경로(`/api/docs`, `/api/swagger`, `/api/openapi.json`)만 뺍니다.
- **남기지 않는 것:** 이름·닉네임, 카카오 회원번호, 세션·초대·제보 토큰, 가입코드, 안내·제보·팁·메모 본문, 반복 제한 계산에 필요한 범위를 넘는 IP, DB 오류 메시지(값이 섞임. 오류 이름과 코드만).

```ts
// apps/api/src/lib/log.ts
type Level = "info" | "warn" | "error";
type Field = string | number | boolean | null | undefined;

export function log(level: Level, event: string, fields: Record<string, Field> = {}) {
  console[level](JSON.stringify({ level, event, time: new Date().toISOString(), ...fields }));
}
```

## 9. 환경 변수

`lib/env.ts`가 zod로 파싱하는 `parseEnv(process.env)`를 두고, `server.ts`가 시작할 때 한 번 호출해 `createApp`에 넘깁니다. 다른 모듈은 `process.env`를 직접 읽지 않습니다. 값이 틀리면 키 이름만 적은 오류로 시작을 멈춥니다(값은 출력하지 않음). `db:*` 스크립트는 필요한 키만 읽습니다.

| 키 | 용도 |
|---|---|
| `NODE_ENV` | `development`(기본)·`test`·`production` |
| `API_HOST`, `API_PORT` | 바인드 주소 (기본 `127.0.0.1:3001`) |
| `DATABASE_URL` | Postgres 연결 문자열 ([database.md](database.md)). 필수 |
| `APP_ORIGIN` | 웹 주소. 로그인 후 이동, 초대·확인 링크, 푸시 URL, 쿠키 `Secure` 판단. 필수 |
| `SESSION_SECRET` | 로그인 중에 쓰는 짧은 쿠키(`state`·`returnTo`) 서명. 세션 토큰 자체는 해시로 저장하므로 이 값과 무관. 32자 이상, 카카오 키가 있으면 필수 |
| `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI` | 카카오 로그인. 키가 없으면 503 `KAKAO_NOT_CONFIGURED`. `KAKAO_REDIRECT_URI`를 비우면 `${APP_ORIGIN}/api/auth/kakao/callback` |
| `DEMO_MODE` | `true`면 시연 로그인(§6)을 엽니다. 기본 `false`. dev는 `true`, prod는 `false` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | 웹 푸시 (아직 구현 전) |

- 로컬 값은 `apps/api/.env`(gitignore)에, 배포 값은 AWS SSM Parameter Store에 둡니다([deploy.md](deploy.md)).
- 키를 추가하면 같은 PR에서 `.env.example`(샘플 값), `lib/env.ts`, deploy.md를 함께 고칩니다.
- 비밀은 `VITE_*`에 넣지 않습니다. `VITE_` 값은 브라우저에 공개됩니다.

## 10. 테스트

| 종류 | 대상 | 방법 |
|---|---|---|
| 라우트 | 상태 코드, 오류 형식, 입력 검증, 인증 경계 | `createApp({ env, db }).request()`. DB가 필요 없으면 `app.test.ts`처럼 |
| 서비스·DB | 권한, 상태 전이, 트랜잭션 | `src/test/helpers.ts`의 `useTestApp()`: `wolgyeham_test`에 마이그레이션을 적용하고, 테스트마다 새 건물·사용자·세션을 만듦(행을 지우지 않음) |

- 기능마다 성공, 실패, 권한 경계 테스트를 하나 이상 둡니다. 예: 안내 공개는 집주인 성공, 없는 안내 404, 거주자 403 `NOT_BUILDING_MANAGER`, 공개 실패 시 메모 `pending` 유지.
- 기존 테스트처럼 `// Given`, `// When`, `// Then`으로 나눕니다. 한국어 문구가 일치하는지만 보는 테스트는 만들지 않습니다.
- 스펙에 새 경로가 들어갔는지 `/api/openapi.json` 테스트에 한 줄 추가합니다.
- DB 테스트는 `TEST_DATABASE_URL`(없으면 로컬 `postgres://wolgyeham:local-development-only@127.0.0.1:54329/wolgyeham_test`)에 연결합니다. 로컬은 `pnpm db:up` 후 테스트 DB를 한 번 만듭니다([database.md §1](database.md#1-현재-상태)). CI(`ci.yml`, `deploy-api.yml`의 check)는 Postgres 17 서비스로 `wolgyeham_test`를 띄웁니다.
- 카카오 API는 테스트에서 `vi.stubGlobal("fetch", ...)`로 대신합니다. 실제 카카오 호출은 테스트하지 않습니다.

## 바꿀 때

- 이 문서와 API 규칙은 PR로 바꿉니다. 오류 형식, 인증 방식, 모듈 구조처럼 결정이 바뀌면 [decisions.md](decisions.md)에 기록합니다.
- 순서는 항상 계약(`packages/contracts`) → API → 웹입니다. 계약을 깨는 변경은 양쪽을 같은 PR에서 고칩니다.
- 권한·상태 규칙이 [lofi/screens.md](../lofi/screens.md)와 다르면 screens.md를 먼저 고치고 이 문서는 링크를 유지합니다.
