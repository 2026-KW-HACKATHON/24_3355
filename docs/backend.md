# 백엔드 개발 가이드

`apps/api`에 엔드포인트를 만들거나 고칠 때 따르는 구조와 규칙입니다. 새 API는 이 문서에 나온 순서와 형식으로 만듭니다.

기준: [lofi/screens.md 개발 계약 초안](../lofi/screens.md#개발-계약-초안), `packages/contracts` · 담당 영역: 백엔드 `apps/api`, 공통 계약 `packages/contracts` ([CONTRIBUTING.md §2](../CONTRIBUTING.md#2-담당-영역))

함께 읽기: [database.md](database.md) · [architecture.md](architecture.md) · [frontend.md](frontend.md) · [deploy.md](deploy.md) · [decisions.md](decisions.md)

## 1. 현재 상태

| 항목 | 상태 |
|---|---|
| `GET /api/health` (프로세스 응답만 확인하고 DB는 보지 않음) | 있음 |
| `/api/openapi.json` 스펙, `/api/swagger` (Swagger UI), `/api/docs` (Scalar) | 있음. 로컬은 `http://127.0.0.1:3001/api/swagger`. `NODE_ENV=production`이면 `API_DOCS=true`일 때만 붙음(§9) |
| `{ "error": { "code": "NOT_FOUND" } }` 404, `INTERNAL_ERROR` 500 | 있음 (`app.ts`) |
| 환경 변수 파싱 (`lib/env.ts`), `lib/`, DB (Drizzle), 세션, 카카오 로그인 | 있음 (구현 순서 A) |
| `modules/` buildings·guides·notices(현재 공지)·manage·me·auth | 있음 (구현 순서 A). 아래 표 |
| 가입코드·연결(`occupancies`)·공지 작성·공지 발송 기록·푸시 구독, `requireOccupancy` | 있음 (구현 순서 B). 아래 표 |
| 수정 메모, 공개된 안내의 수정본·수정 공개 | 있음 (구현 순서 C). 아래 표, §7 |
| 재확인(읽을 때 계산)·‘아직 살아요’·이사 | 있음 (구현 순서 D). 아래 표, §7 |
| 웹 푸시 실제 발송 | 있음. `web-push`로 VAPID 발송, 푸시 서비스 주소 허용 목록(§7 웹 푸시) |
| 공지 열람(`opened_at`) 기록 | 있음. `POST /notices/:noticeId/opened`(§7 공지) |
| 제보(비회원 조회 토큰·같은 브라우저 재조회·반복 접수 제한·집주인 처리) | 있음 (구현 순서 E). 아래 표, §7 |
| 생활 팁·본인 글 관리·콘텐츠 신고, 운영자 가림 스크립트(`db:moderate`) | 있음 (구현 순서 F). 아래 표, §7. 운영자 웹 화면(LF-19)은 아직 없음 |
| 건물 확인(LF-12·23: 이름 고치기·확인 시각) | 있음. 아래 표, §7 건물 확인 |
| 약관 동의 기록(D-28: 동의한 판·시각, `/me`의 `termsUpToDate`) | 있음. §5, §7 약관 동의 |
| 시연 시작(LF-20·29: 시연 건물·계정 목록, 시연 건물만 초기화) | 있음. `DEMO_MODE` 전용, §6 |

구현 순서 A(초대 → 안내 작성·공개 → 비회원이 공개 화면에서 읽기), B(가입코드 → 로그인 → 연결 → 공지·알림), C(수정 메모 → 집주인 판단 → 안내 갱신), D(재확인·이사), E(제보), F(생활 팁·신고)의 경로입니다. 요청·응답 스키마는 `packages/contracts`와 `/api/swagger`가 기준입니다.

| 경로 (`/api` 생략) | 누가 | 응답 |
|---|---|---|
| `GET /buildings/:buildingId` | 누구나 | 건물(이름·도로명 주소·상태). preparing도 돌려줌, 없으면 404 |
| `GET /buildings/:buildingId/guides` | 누구나 | 공개된 안내만 `position` 순 |
| `GET /guides/:guideId` | 누구나 / 초안은 그 건물 집주인 | 볼 수 없는 초안은 404 |
| `GET /buildings/:buildingId/notices/current` | 누구나 | 끝나지 않은 공지 중 가장 최근 것 또는 `null` |
| `GET /manage/buildings`, `GET /manage/buildings/:buildingId` | 집주인 | 관리하는 건물(팀 확인 주소, 건물 확인 시각 `confirmedAt` 포함)과 안내 개수·확인 전 메모 수(`pendingMemoCount`)·확인 전 제보 수(`newReportCount`)·보이는 팁 수(`tipCount`) / 초안 포함 전체 안내 |
| `PATCH /manage/buildings/:buildingId` | 그 건물 집주인 | 건물 이름만 고침(`name`, 앞뒤 공백 제거 뒤 1~40자 한 줄). 주소·상태·확인 시각은 그대로. 응답 `ManagedBuilding` |
| `POST /manage/buildings/:buildingId/confirm` | 그 건물 집주인 | 건물 확인(23 ‘맞아요, 안내 쓰기’). 처음이면 `confirmedAt`을 남기고, 이미 확인했으면 그 시각 그대로 200. `name`(선택)을 보내면 함께 고침. 응답 `ManagedBuilding` |
| `POST /buildings/:buildingId/guides` | 집주인 | 초안 만들기 |
| `PATCH /guides/:guideId` | 집주인 | 초안은 바로 고침. 공개된 안내는 공개 내용을 두고 수정본에 저장(§7). 응답 `ManagedGuide`: 공개(초안) 내용 + `revision` |
| `GET /guides/:guideId/revision`, `DELETE /guides/:guideId/revision` | 집주인 | 저장한 수정본(없으면 `revision: null`) / 편집 취소: 수정본만 지움(204, 없어도 성공) |
| `POST /guides/:guideId/publish` | 집주인 | 공개 + 첫 공개면 건물 open(`buildingOpened`). 공개된 안내는 수정본을 공개 내용으로(수정 공개, 수정본이 없으면 409). 본문 `applyMemoIds`(선택)는 같은 트랜잭션에서 `applied`, 응답 `appliedMemoIds` |
| `GET /guides/:guideId/correction-memos`, `POST /guides/:guideId/correction-memos` | 읽기: 이 건물 active·reconfirm_needed 거주자와 집주인 / 쓰기: active 거주자 | 안내의 메모(최근 순 100개, 작성자 없음, 내가 쓴 메모만 `mine: true`) / 메모 남기기(201 `pending`). 초안·없는 안내는 404, 집주인이 쓰면 403 `FORBIDDEN`, 같은 안내에 60초 안에 다시 쓰면 429 `RATE_LIMITED` |
| `GET /buildings/:buildingId/correction-memos`, `GET /correction-memos/:memoId` | 집주인 | 건물의 메모와 안내 제목(`pending` 먼저, 200개, `?status=pending`) / 메모 하나(LF-17) |
| `POST /correction-memos/:memoId/keep` | 집주인 | 기존 유지(`reason` 필수, 한 줄 200자 → `kept`). `pending`이 아니면 409 |
| `POST /occupancies/:occupancyId/reconfirm`, `POST /occupancies/:occupancyId/move-out` | 연결한 본인 | 아직 살아요(active, 확인 시각 갱신) / 이사했어요(inactive). 남의 연결·없는 연결은 404, 이미 끝난 연결은 409 |
| `POST /manager-invites/preview`, `POST /manager-invites/accept` | 누구나 / 로그인 | 초대받은 건물 이름 / 수락 |
| `GET /me`, `POST /auth/logout`, `GET /auth/kakao/start`, `GET /auth/kakao/callback` | — | §5. `/me`는 살아 있는 연결(`occupancy`, 없으면 null)과 재확인 상태(`reconfirmRequested`·`nextReconfirmAt`·`reconfirmDueAt`, §7), 약관 동의(`user.termsVersion`·`termsAgreedAt`·`termsUpToDate`, §7)도 돌려줌. 로그인 시작의 `consent`는 §5 |
| `POST /me/terms-consent` | 로그인 | 로그인한 채로 지금 판(`TERMS_VERSION`)에 동의(판이 바뀌어 다시 물었을 때). 응답 `Me`. 이전 판이면 409 `CONFLICT` |
| `GET /me/reports`, `GET /me/tips` | 로그인 | 이 계정으로 보낸 제보(모든 건물, 최근 순 100건, 비회원 때 보낸 것은 없음) / 내가 쓴 팁(가린 팁은 `hidden`, 지금 그 건물과 연결돼 있으면 `editable`) |
| `GET /buildings/:buildingId/join-code`, `POST /buildings/:buildingId/join-code` | 집주인 | 현재 가입코드(없으면 `joinCode: null`) / 새 코드 만들기·바꾸기(201, 이전 코드 종료) |
| `POST /buildings/:buildingId/join-code/check` | 누구나 (로그인 전) | 코드가 맞으면 건물 이름. 틀리면 409 `JOIN_CODE_INVALID`, 5회 틀리면 429 `JOIN_CODE_LOCKED`(로그인하지 않았으면 건물 전체 상한도, §7). 시도 횟수 말고는 아무것도 바꾸지 않음 |
| `POST /buildings/:buildingId/occupancies` | 로그인 | 코드를 다시 확인하고 연결(201). 이미 이 건물이면 200 `alreadyConnected`(재확인 요청 중이었으면 `reconfirmed: true`로 ‘아직 살아요’ 처리), 다른 건물이면 `replaceOccupancyId` 없이 409 `ALREADY_CONNECTED`. 옮기면 이 계정의 푸시 구독을 지움 |
| `GET /buildings/:buildingId/notices`, `GET /notices/:noticeId` | 누구나 | 끝나지 않은 공지 목록 / 공지 상세. 끝난 공지는 목록에서 빠지고 상세는 410 `NOTICE_ENDED` |
| `POST /notices/:noticeId/opened` | 로그인 | 공지 열람 기록. 이 공지의 알림 대상이었으면 처음 한 번 `opened_at`, 아니면 아무것도 안 함(둘 다 204). 없는 공지 404 |
| `POST /buildings/:buildingId/notices`, `GET /buildings/:buildingId/notices/audience` | 집주인 | 공지 올리기(201, `attemptedCount` = 알림 대상 수, 발송은 응답 뒤) / 연결된 거주자 수·알림 대상 수 |
| `GET /push-subscriptions/public-key` | 누구나 | VAPID 공개키. 보낼 수 없는 환경이면 `publicKey: null` |
| `POST /push-subscriptions`, `DELETE /push-subscriptions` | active 거주자 / 로그인 | 이 브라우저 구독 저장(204. 알려진 푸시 서비스 주소만, 같은 endpoint는 `auth`가 같을 때만 덮어씀, 사용자마다 최근 5개, 10분에 10번 넘으면 429 `RATE_LIMITED`) / 내 구독 삭제(204, 없어도 성공) |
| `POST /buildings/:buildingId/reports` | 누구나(그 건물 집주인 제외) | 집주인에게 알리기(201). 자주 쓰는 말 또는 직접 적기. 비회원이면 `accessToken`(한 번만)·`accessExpiresAt`. 집주인은 403 `FORBIDDEN`, 반복이면 429 `REPORT_TOO_FREQUENT`·`RATE_LIMITED` |
| `POST /buildings/:buildingId/reports/lookup` | 누구나 | 같은 브라우저 재조회(30). 본문의 조회 토큰(1~20개)과 같은 순서로 이 건물의 유효한 제보, 무효 자리는 null |
| `GET /reports/:reportId` | 그 건물 집주인, 보낸 계정, `X-Report-Token` | 제보와 `viewer`(`reporter`·`manager`). 집주인에게만 `reporterKind`(거주자·회원·비회원). 토큰 없음·틀림 404, 만료 410 `REPORT_LINK_EXPIRED`. 열어도 상태는 그대로 |
| `GET /buildings/:buildingId/reports` | 집주인 | 받은 내용(최근 순 200건, `?status=received`) |
| `POST /reports/:reportId/acknowledge`, `POST /reports/:reportId/resolve` | 집주인 | 확인했어요(received → acknowledged) / 처리 결과(`result` completed·unable, `note` 한 줄·선택). 순서가 맞지 않으면 409 |
| `GET /buildings/:buildingId/tips`, `POST /buildings/:buildingId/tips` | 읽기: 이 건물 active·reconfirm_needed 거주자와 집주인 / 쓰기: active 거주자 | 보이는 팁(최근 순 200개, 작성자 없음, 작성 월 `createdMonth`, 내 팁만 `mine`) / 팁 남기기(201). 집주인이 쓰면 403 `FORBIDDEN` |
| `PATCH /tips/:tipId`, `DELETE /tips/:tipId` | 그 건물과 연결된(active·reconfirm_needed) 작성자 | 본인 팁 고치기(200) / 지우기(204, 목록에서만 빠짐). 남의 팁·지운 팁 404, 이사한 뒤 403 `NOT_CONNECTED`(운영팀 요청), 가린 팁·검토 전 신고가 있는 팁 고치기는 409 `CONFLICT` |
| `POST /tips/:tipId/content-reports` | 이 건물 active·reconfirm_needed 거주자와 집주인 | 팁 신고(201, 사유 선택·한 줄). 신고할 때의 팁 내용을 함께 남김. 다시 하면 200 `alreadyReported`. 본인 팁 403 `FORBIDDEN`, 가린 팁·지운 팁 404 |
| `GET·POST /dev/login`, `GET /dev/whoami` | 시연 모드만 | §6. `DEMO_MODE=true`가 아니면 경로가 없어 404. whoami는 요청한 사람 자신의 X-Forwarded-For와 서버가 고른 클라이언트 주소(§7 클라이언트 IP) |
| `GET /dev/demo`, `POST /dev/reset` | 시연 모드만, 누구나(로그인 없이) | 29 시연 시작: 시연 건물(이름·상태·확인 시각·쓰임 `demo`/`e2e`·지금 가입코드)과 역할 전환 계정(`as`·이름·역할과 지금 상태), 5초 동안 같은 결과 / 발표 시연 건물 두 곳(햇살빌라·새봄하우스)만 처음 상태로. 같은 사람(IP) 30초에 1번·시간당 10번, 모든 사람 합쳐 30초에 1번·시간당 20번, 넘으면 429 `RATE_LIMITED`. §6 |

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
│  ├─ reconfirm.ts      재확인 상태 계산(occupancyState)과 지금 active인 연결의 SQL 조건
│  ├─ client.ts         반복 제한용 클라이언트 IP, 주소 묶음(IPv6 /64), HMAC IP 키
│  ├─ push.ts           웹 푸시 발송 창구 PushSender와 web-push 발송기 (createApp이 주입)
│  ├─ cloudfront-ranges.json  CloudFront·EC2 ap-northeast-2 IP 대역 (scripts/update-cloudfront-ranges.ts로 갱신, fetchedAt 포함)
│  ├─ tasks.ts          응답 뒤에 이어서 하는 일(TaskRunner, 공지 푸시). 실패해도 로그만
│  ├─ rate-limit.ts     고정 창 횟수 제한(rate_limits, 푸시 구독 저장)
│  ├─ errors.ts         AppError, 검증 실패 변환, 오류 응답 문서화
│  ├─ context.ts        Hono 환경 타입 AppEnv (db·env·push·tasks·user·requestId)
│  └─ log.ts            JSON 한 줄 로거
├─ db/
│  ├─ schema.ts         Drizzle 스키마
│  ├─ migrate.ts        마이그레이션 실행 (이미지에서는 migrate.mjs)
│  ├─ demo.ts           시연 데이터 시드·초기화 함수(seedDemo·resetDemo, 시연 건물·계정 목록). CLI와 시연 모드 API가 같이 씀
│  ├─ seed.ts           db:seed CLI (인자 읽기와 출력만, demo.ts를 부름)
│  ├─ invite.ts         집주인 초대 발급 (db:invite)
│  ├─ moderate.ts       운영자 팁 신고 검토·가림·복원 (db:moderate)
│  └─ moderate-cli.ts   db:moderate 인자 읽기와 출력(제어문자 이스케이프)
├─ scripts/update-cloudfront-ranges.ts   AWS ip-ranges.json에서 CloudFront·EC2 ap-northeast-2 대역 갱신 (ranges:cloudfront)
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
- 서비스·repo 함수는 첫 인자로 `Database`(라우트의 `c.var.db` 또는 트랜잭션 `tx`)를 받습니다. `createApp({ env, db, push? })`가 요청마다 `c.var.env`·`c.var.db`·`c.var.push`를 넣습니다.
- 프론트엔드는 `apps/api` 코드를 가져오지 않고 `@wolgyeham/contracts`만 씁니다.

| 모듈 | 다루는 것 | 경로 초안 (`/api` 생략, 계약에서 확정) |
|---|---|---|
| `auth` | 카카오 로그인, 세션, 약관 동의 기록, 시연 로그인·whoami | `GET /auth/kakao/start`, `GET /auth/kakao/callback`, `POST /auth/logout`, `GET·POST /dev/login`, `GET /dev/whoami` |
| `me` | 내 정보, 보낸 내용, 내 팁, 약관 다시 동의(reports·tips·auth 서비스를 부름) | `GET /me`, `GET /me/reports`, `GET /me/tips`, `POST /me/terms-consent` |
| `demo` | 시연 시작(29). `DEMO_MODE`일 때만 붙음. 여러 모듈 서비스와 `db/demo.ts`를 부름 | `GET /dev/demo`, `POST /dev/reset` |
| `buildings` | 건물, 건물 이름·확인, 집주인 초대·관리자, 가입코드와 실패 횟수 | `GET /buildings/:buildingId`, `POST /manager-invites/preview`, `POST /manager-invites/accept`, `GET·POST /buildings/:buildingId/join-code`, `POST /buildings/:buildingId/join-code/check` (이름 고치기·확인의 규칙은 여기, 경로는 `manage`) |
| `manage` | 관리 화면(여러 모듈 묶음), 건물 이름 고치기·건물 확인 | `GET /manage/buildings`, `GET·PATCH /manage/buildings/:buildingId`, `POST /manage/buildings/:buildingId/confirm` |
| `guides` | 기본 안내, 수정본, 수정 메모 | `GET·POST /buildings/:buildingId/guides`, `GET·PATCH /guides/:guideId`, `GET·DELETE /guides/:guideId/revision`, `POST /guides/:guideId/publish`, `GET·POST /guides/:guideId/correction-memos`, `GET /buildings/:buildingId/correction-memos`, `GET /correction-memos/:memoId`, `POST /correction-memos/:memoId/keep` |
| `notices` | 공지, 발송·열람 기록, 푸시 구독 | `GET·POST /buildings/:buildingId/notices`, `GET /buildings/:buildingId/notices/current`, `GET /buildings/:buildingId/notices/audience`, `GET /notices/:noticeId`, `POST /notices/:noticeId/opened`, `POST·DELETE /push-subscriptions`, `GET /push-subscriptions/public-key` |
| `occupancies` | 연결, 재확인, 이사 | `POST /buildings/:buildingId/occupancies`, `POST /occupancies/:occupancyId/reconfirm`, `POST /occupancies/:occupancyId/move-out` |
| `reports` | 제보, 비회원 조회 토큰, 반복 접수 제한 | `GET·POST /buildings/:buildingId/reports`, `POST /buildings/:buildingId/reports/lookup`, `GET /reports/:reportId`, `POST /reports/:reportId/acknowledge`, `POST /reports/:reportId/resolve` |
| `tips` | 생활 팁, 콘텐츠 신고, 운영자 가림(스크립트) | `GET·POST /buildings/:buildingId/tips`, `PATCH·DELETE /tips/:tipId`, `POST /tips/:tipId/content-reports` |

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
| 403 | `FORBIDDEN`, `NOT_BUILDING_MANAGER`, `NOT_CONNECTED`, `RECONFIRM_NEEDED` | 로그인은 했지만 이 건물과의 관계가 없거나 멈춤. 다른 출처에서 온 폼 요청(CSRF 차단)도 `FORBIDDEN` |
| 404 | `NOT_FOUND` | 없음. 볼 권한이 없는 대상의 존재를 숨길 때도 씀 (다른 사람의 초안, 틀린 제보 토큰) |
| 409 | `CONFLICT`, `JOIN_CODE_INVALID`, `ALREADY_CONNECTED` | 이미 상태가 바뀜(조건부 UPDATE 0건·동시 요청의 유니크 충돌), 가입코드 불일치, 다른 건물과 연결돼 있는데 옮길 연결을 확인하지 않음 |
| 410 | `REPORT_LINK_EXPIRED`, `NOTICE_ENDED`, `INVITE_EXPIRED` | 기간이 지남 |
| 413 | `PAYLOAD_TOO_LARGE` | `/api/*` 요청 본문이 64KB를 넘음 |
| 429 | `RATE_LIMITED`, `JOIN_CODE_LOCKED`, `REPORT_TOO_FREQUENT` | 반복 제한. `Retry-After` 헤더(남은 초)를 붙임. `AppError`의 네 번째 인자로 헤더를 넘김. `REPORT_TOO_FREQUENT`는 같은 문구의 제보, `RATE_LIMITED`는 그 밖의 횟수 제한(제보 시간당 상한, 같은 안내 메모 60초) |
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

1. 웹이 `GET /api/auth/kakao/start?returnTo=<경로>[&consent=<판>]`로 이동합니다. API는 `state`를 만들어 짧은 수명(10분)의 HttpOnly 쿠키에 `returnTo`와 함께 넣고 `SESSION_SECRET`으로 서명한 뒤(`hono/cookie`의 `setSignedCookie`) 카카오 인가 주소로 302 응답합니다. `returnTo`는 `/`로 시작하는 같은 사이트 경로만 받습니다(contracts `ReturnTo`). `//`·`/\`로 시작하는 값, `.`·`..` 경로 조각, 공백·제어 문자, `%2F`·`%5C`·제어 문자의 인코딩은 400으로 거부하고, 조립한 주소가 `APP_ORIGIN`을 벗어나면 `/`로 보냅니다.
2. 카카오가 `GET /api/auth/kakao/callback?code&state`로 돌려보냅니다. API는 `state`를 확인하고 코드를 토큰으로 바꾼 뒤 카카오 회원번호만 조회합니다. 카카오 액세스 토큰은 저장하지 않습니다.
   - 사용자 정보 조회(`POST https://kapi.kakao.com/v2/user/me`)에는 `property_keys=["has_signed_up"]`(폼 본문)을 붙입니다. 회원번호(`id`)는 항상 오므로, 개인정보가 아닌 응답 필드 하나만 골라 조회 범위를 좁힙니다([카카오 REST API ‘사용자 정보 조회 범위 지정’](https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api)). 카카오 콘솔에 닉네임·프로필 사진·이메일 동의항목이 켜져 있어도 이 응답에는 담기지 않고, 담겨 와도 서버는 `id`만 읽고 나머지는 버립니다(저장·로그 없음). 인가 요청에는 `scope`를 붙이지 않으므로 동의 화면에 뜨는 항목은 콘솔 설정을 따릅니다. 콘솔의 동의항목은 모두 ‘사용 안 함’으로 둡니다.
3. `users`를 upsert하고, 서명한 쿠키에 동의 판이 있으면 계정에 남긴 뒤(아래) 세션을 만들고 `APP_ORIGIN + returnTo`로 302 응답합니다. 사용자가 취소하면 `?login=cancelled`, state 불일치·카카오 오류면 `?login=failed`를 붙여 `returnTo`로 보냅니다(contracts `LOGIN_RESULT_PARAM`, `LOGIN_RESULTS`). state 쿠키가 없으면 `/`로 보냅니다. 사용자 저장·세션 생성이 실패해도 JSON 오류 대신 `?login=failed`로 보내고, 로그에는 `kakao_callback_failed`와 오류 이름만 남깁니다.

- **약관 동의(D-28):** 로그인 전에 동의를 받은 웹은 `consent=<판>`(contracts `TERMS_VERSION`, 형식 `TermsConsent`: 영숫자로 시작하고 영숫자·`.`·`_`·`-`만, 64자 이하, 형식이 틀리면 400)을 붙입니다. 지금 판과 같고 **우리 화면에서 시작한 요청**일 때만 `state`·`returnTo`와 함께 서명한 쿠키에 담고, 콜백에서는 **쿠키의 값만** 읽어 계정에 남깁니다(콜백 쿼리의 `consent`는 보지 않음, 쿠키를 고치면 서명이 맞지 않아 로그인 자체가 `?login=failed`). 이전 판(배포 사이의 웹)이면 로그인은 되고 동의만 남기지 않아 `/me`의 `termsUpToDate`가 false입니다. 시연 로그인(`POST /dev/login`)도 본문 `consent`로 같게 처리합니다. 저장 규칙은 §7 약관 동의.
  - **같은 출처 확인(`lib/auth.ts` `isSameOriginRequest`):** 로그인 시작은 GET 이동이라 CSRF 미들웨어가 막지 않고, 카카오는 이미 연결한 사용자를 묻지 않고 돌려보내므로 다른 사이트의 링크(`…/kakao/start?consent=<판>`)만으로 약관을 본 적 없는 사람의 동의가 남을 수 있습니다. 그래서 `Sec-Fetch-Site`가 있으면 `same-origin`일 때만, 없으면(오래된 브라우저, https가 아닌 주소) `Origin`(없으면 `Referer`)의 출처가 `APP_ORIGIN`일 때만 동의를 담습니다. `cross-site`·`same-site`·`none`(주소 직접 입력·북마크)이거나 헤더가 모두 없으면 로그인만 하고 동의는 남기지 않습니다(웹이 `termsUpToDate: false`를 보고 다시 물음). 시연 로그인(`POST /dev/login`)은 JSON POST라 다른 사이트는 보낼 수 없어(JSON은 CORS 사전 요청, 폼 형식 `text/plain`은 `hono/csrf` 403) 이 검사를 하지 않습니다(e2e의 Playwright API 요청은 `Sec-Fetch-Site`를 붙이지 않음). 앞단(CloudFront `AllViewerExceptHostHeader`, Amplify `/api` rewrite)이 `Sec-Fetch-Site`·`Referer`를 넘겨야 하고, 넘기지 않으면 로그인 뒤 약관을 한 번 더 묻게 됩니다.

| 세션 쿠키 `wh_session` | 값 |
|---|---|
| 값 | 32바이트 난수(base64url). DB `sessions`에는 SHA-256 해시만 저장 |
| 속성 | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure`(`APP_ORIGIN`이 `https://`일 때. 로컬 http만 제외) |
| 수명 | 30일. 사용할 때 연장(rolling)하고, 연장 쓰기는 하루 한 번 이하. 로그인한 때부터 90일이 지나면 연장하지 않고 끝냄 |
| 다시 로그인 | 요청에 기존 세션 쿠키가 있으면 그 세션 행을 지우고 새로 만듦 |
| 로그아웃 | `POST /api/auth/logout`: 세션 행 삭제 + 쿠키 삭제. 본문(없어도 됨, contracts `LogoutBody`)에 이 브라우저의 알림 구독 주소 `pushEndpoint`를 보내면 같은 요청에서 **내** 그 구독(`push_subscriptions`)을 지움(다른 사람이 이 기기로 로그인해도 내 공지 알림이 오지 않게). 알려진 푸시 서비스 주소(`isAllowedPushEndpoint`)가 아니거나 세션이 없으면 지우지 않고 204. 문자열이 아니면 400 |

- 웹과 API는 모든 환경에서 같은 출처입니다. 로컬은 Vite 프록시, 배포 환경은 Amplify의 `/api/*` rewrite가 API로 넘깁니다([deploy.md](deploy.md)). 그래서 CORS 설정을 두지 않고 쿠키는 1st-party입니다. 대신 `/api/*`에 `hono/csrf`를 붙여 `Origin`이 `APP_ORIGIN`과 다른 폼 형식 요청(`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`)을 403으로 막습니다. JSON 요청은 교차 출처에서 보내려면 사전 요청이 필요해 그대로 둡니다.
- 브라우저 주소, `APP_ORIGIN`, `KAKAO_REDIRECT_URI`의 호스트를 맞춥니다. `localhost`와 `127.0.0.1`은 쿠키가 따로 저장됩니다.
- **카카오 로그인은 거주를 증명하지 않습니다.** 거주 관계는 가입코드로 만든 `occupancies`만 봅니다.

## 6. 권한

권한은 로그인 여부가 아니라 이 건물과의 관계로 판단하고, 요청마다 서비스에서 확인합니다. 버튼을 숨기는 것으로 대신하지 않습니다. 행동별 허용 범위는 [screens.md §1 권한](../lofi/screens.md#1-권한) 표를 따릅니다.

| 헬퍼 (`lib/auth.ts`) | 통과 조건 | 실패 |
|---|---|---|
| `requireUser(c)` | 유효한 세션 | 401 `UNAUTHENTICATED` |
| `requireManager(db, userId, buildingId)` | `building_managers`에 행이 있음 | 403 `NOT_BUILDING_MANAGER` |
| `requireOccupancy(db, userId, buildingId, { allow })` | 사용자의 살아 있는 연결이 이 건물이고 상태(재확인 기한을 반영해 계산한 값, §7)가 `allow` 안에 있음. `buildingId`가 null이면 건물과 관계없이(푸시 구독) | 403 `NOT_CONNECTED`(연결 없음·다른 건물·`inactive`), `RECONFIRM_NEEDED`(`reconfirm_needed`인데 허용 안 됨) |

- `allow: ["active"]`: 메모 쓰기, 팁 쓰기, 공지 알림 구독(`POST /push-subscriptions`).
- `allow: ["active", "reconfirm_needed"]`: 메모 읽기, 팁 읽기, 본인 팁 고치기·지우기(팁의 건물 기준), 팁 신고. 집주인은 `requireManager`로 따로 허용합니다(메모 읽기·유지·반영, 팁 읽기·신고). 집주인은 메모·팁을 쓰지 않고 자기 건물에 제보하지 않습니다(403 `FORBIDDEN`).
- 제보 보내기는 누구나(로그인 없이도)입니다. 제보 보기는 그 건물 집주인, 이 계정으로 보낸 사람, 조회 토큰을 가진 사람만이고 그 밖에는 있는지도 알리지 않고 404입니다.
- 재확인·이사는 건물이 아니라 연결의 주인(`occupancies.user_id`)만 합니다. 다른 사람의 연결은 있는지도 알리지 않고 404입니다.
- `buildingId`는 요청 경로를 믿지 않고 대상 자원에서 꺼냅니다. `/guides/:guideId`라면 `guide.buildingId`로 확인합니다.
- 집주인 권한은 팀이 발급한 `manager_invites`를 수락했을 때만 생깁니다. 지금은 팀이 스크립트로 발급합니다: `pnpm --filter @wolgyeham/api db:invite <buildingId> [유효 일수]`가 `${APP_ORIGIN}/invite#t=<토큰>`을 한 번만 출력하고 DB에는 해시만 저장합니다. 유효 기간(기본 7일), 건물 등록 방법, 운영자(LF-19) 권한 모델은 정할 것입니다.
- 시연 모드(LF-20)는 dev·데모 데이터에서만 엽니다. 역할 전환은 시드된 시연 사용자로 바꾸는 것일 뿐 실제 권한을 만들지 않습니다.
- **시연 로그인 (dev·시연 전용):** 환경 변수 `DEMO_MODE=true`일 때만 `app.ts`가 `GET /api/dev/login`(쓸 수 있으면 204, 부작용 없음)과 `POST /api/dev/login`(`{ "as": "demo-landlord" | "demo-resident-a" | "demo-resident-b" | "demo-e2e-landlord" }` → 시드된 시연 사용자 세션)을 붙입니다. 꺼져 있으면 경로 자체가 없어 404입니다. 시연 집주인은 시연 건물(햇살빌라)만 관리하고, 입주자 A는 햇살빌라에 연결돼 있고(시드 옵션으로 ‘재확인 요청됨’, database.md §8), 다음 입주자 B는 연결 전입니다(시연 가입코드로 연결). e2e 집주인은 e2e 전용 건물(테스트빌라)만 관리합니다(database.md §8). 같은 조건에서 `GET /api/dev/whoami`가 요청한 사람 자신의 X-Forwarded-For 목록·소켓 주소·서버가 고른 클라이언트 주소·방식(`origin-verify`·`proxy-hops`·`socket`)·`X-Origin-Verify` 일치 여부를 돌려줍니다(헤더 값 자체는 돌려주지 않고, 로그에는 경로만 남음). 배포 뒤 실제 프록시 체인을 재는 데 씁니다. prod는 `DEMO_MODE=false`로 둡니다.
- **시연 시작(LF-20·29, D-29):** `DEMO_MODE=true`일 때만 `app.ts`가 `modules/demo`의 두 경로를 붙입니다(꺼져 있으면 404, `/api/openapi.json`에도 없음). 로그인 없이 부를 수 있으므로 읽는 것은 시연 건물(`db/demo.ts`의 `DEMO_BUILDINGS`)과 시연 계정 자신의 관계(관리하는 건물과 그 건물의 확인할 것, 연결, 쓴 팁·메모 수)뿐이고, 바꾸는 것은 발표 시연 건물 두 곳과 시연 계정의 시드 상태뿐입니다.
  - `GET /api/dev/demo`: 시연 건물(`id`·`name`·`status`·`confirmedAt`·`purpose`(`demo`=29에 보임, `e2e`=테스트 전용)·`joinCode`(지금 가입코드, 시연 건물이라 보여 줌))과 계정(`DemoAccount`, `role`로 나뉨). 집주인은 관리하는 건물과 `pendingMemoCount`·`newReportCount`(29의 ‘확인할 것’), 거주자는 살아 있는 연결(`MeOccupancy`, 없으면 null)과 보이는 내 팁 수·내 메모 수. 부작용 없음. 시드하지 않은 건물·계정은 빠짐. 한 번에 열 개 넘는 쿼리를 쓰므로 계산한 결과를 프로세스 안에서 5초 동안 함께 씁니다(동시에 온 요청도 한 번만 계산). 이 프로세스에서 시드·초기화하면(`db/demo.ts`가 판 번호를 올림) 바로 다시 계산하고, 계산이 실패하면 담아 두지 않습니다. 다른 화면에서 바꾼 숫자는 최대 5초 늦게 보일 수 있습니다.
  - `POST /api/dev/reset`: 발표 시연 건물 두 곳(`purpose: "demo"`, 햇살빌라·새봄하우스)만 `resetDemo(scope: "demo")`로 되돌립니다(본문 `reconfirmRequested: true`면 `--reconfirm-requested`와 같음, 29의 비회원 시연 제보도 되돌림). e2e 건물(테스트빌라·준비빌라)과 e2e 집주인은 건드리지 않고, 이 둘은 CLI `db:seed -- --reset-demo`(네 곳 모두)로만 되돌립니다. 응답은 되돌린 건물(두 곳)마다 지운 행 수(`removed`). CSRF는 전역 `hono/csrf`(다른 출처의 폼 형식·본문 없는 요청 403)가 막습니다. 반복은 `rate_limits`로 **먼저 같은 사람**(IP 키, `lib/client.ts` `ipKey`: 로그인해도 IP로 셈) 30초에 1번(`demo-reset-client-interval`)·한 시간에 10번(`demo-reset-client-hourly`), **그다음 모든 사람을 합쳐** 30초에 1번(`demo-reset-interval`)·한 시간에 20번(`demo-reset-hourly`)까지입니다(contracts `DEMO_RESET_CLIENT_INTERVAL_SECONDS`·`DEMO_RESET_CLIENT_HOURLY_LIMIT`·`DEMO_RESET_INTERVAL_SECONDS`·`DEMO_RESET_HOURLY_LIMIT`). 넘으면 429 `RATE_LIMITED`와 `Retry-After`, 초기화하지 않습니다. 같은 사람 제한에 걸린 요청은 모든 사람 횟수를 쓰지 않으므로 한 사람이 전체 한도를 혼자 다 쓰지 못합니다(두 곳 이상의 주소가 모이면 여전히 다 쓸 수 있어 dev·시연 환경에서만 엽니다). 횟수는 초기화 트랜잭션 밖에서 세고, 입력 검증(400)·CSRF(403)에 걸린 요청은 세지 않습니다. 로그는 `demo_reset`(건물 수만).

## 7. 도메인 규칙

상태 이름과 전이는 [screens.md §3 상태 전이](../lofi/screens.md#3-상태-전이)가 기준입니다. 여기에는 구현할 때 지킬 것만 적습니다.

- **상태 전이:** `UPDATE ... WHERE id = ? AND status = '<이전 상태>'`로 바꾸고, 0건이면 409 `CONFLICT`입니다. 조회만으로 상태를 바꾸지 않습니다(제보 `acknowledged`는 버튼 요청으로만).
- **안내 공개:** `POST /guides/:guideId/publish` 한 번이 트랜잭션 하나입니다. 초안이면 `published`로 바꾸고 건물의 첫 공개면 `buildings.status`를 `preparing` → `open`으로 바꿉니다. 공개된 안내면 저장한 수정본을 공개 내용으로 옮기고(수정 공개) 수정본을 지웁니다. 수정본이 없으면 409입니다. 이어서 `applyMemoIds`(중복은 한 번으로)를 이 안내의 `pending` 메모만 `applied`로 바꾸고, 바뀐 수가 요청과 다르면(다른 안내의 메모·이미 반영하거나 유지한 메모) 409로 모두 되돌립니다. 어떤 실패든 공개 내용·수정본·메모 상태는 그대로 남습니다. `published_at`은 첫 공개 시각으로 두고, `updated_at`(화면의 ‘수정’ 날짜)은 공개 내용이 바뀔 때만 바뀝니다.
- **공개된 안내 고치기:** 공개된 안내의 `PATCH`는 `guides` 행을 건드리지 않고 `guide_revisions`(안내마다 한 행)에 저장합니다. 보낸 필드만 바꾸고 보내지 않은 필드는 이전 수정본, 없으면 공개 내용에서 채웁니다. 병합은 한 문장(`INSERT … ON CONFLICT DO UPDATE`에서 보낸 필드만 `excluded`로)이라 서로 다른 필드를 동시에 저장해도 서로 덮어쓰지 않습니다. 공개 화면(`GET /guides/:guideId`, 목록)은 수정본을 보여주지 않습니다. 편집 취소는 `DELETE /guides/:guideId/revision`이고, 저장이나 공개가 실패하면 수정본은 남아 이어서 고칠 수 있습니다. 사진은 아직 수정본에 없습니다(사진 저장 위치를 정한 뒤).
- **수정 메모:** 공개된 안내에만 붙고 200자 이하입니다. 쓰기는 그 건물 active 거주자만, 읽기는 active·reconfirm_needed 거주자와 집주인입니다. 작성자는 `author_user_id`에만 저장하고 어떤 응답에도 넣지 않으며, 거주자 응답에는 요청한 사람이 쓴 메모인지(`mine`)만 붙입니다. 거주자는 안내 아래에서 자기 메모의 상태(확인 전·반영됨·기존 유지와 유지 사유)를 봅니다. 상태는 `pending` → `applied`(수정 공개 트랜잭션에서만) 또는 `kept`(`POST /correction-memos/:memoId/keep`, 사유 200자 이하 필수)이고, 이미 결정한 메모는 409입니다. 같은 사람이 같은 안내에 60초(contracts `CORRECTION_MEMO_REPEAT_SECONDS`) 안에 다시 쓰면 429 `RATE_LIMITED`와 `Retry-After`입니다((작성자, 안내) advisory lock 아래에서 마지막 메모 시각을 보므로 동시 요청도 하나만 들어감).
- **건물 확인(LF-12·23):** 초대를 수락한 집주인은 23에서 건물 이름(고칠 수 있음)과 팀이 확인한 주소(`fullAddress`, 읽기만)를 확인합니다. `ManagedBuilding.confirmedAt`이 null이면 확인 전이라 웹은 수락 뒤 33(안내 쓰기) 전에 23을 보여 줍니다. ‘맞아요’는 `POST /manage/buildings/:buildingId/confirm`(이름을 고쳤으면 `name`)이고, `confirmed_at = coalesce(confirmed_at, now())`와 이름을 한 문장으로 적어 처음 확인한 시각만 남깁니다(뒤로 갔다가 다시 눌러도 200). 나중에 이름만 바꿀 때는 `PATCH /manage/buildings/:buildingId`이고 확인 시각은 바뀌지 않습니다. 둘 다 그 건물 집주인만(다른 집주인·거주자 403 `NOT_BUILDING_MANAGER`, 로그인 안 함 401, 없는 건물 404)입니다. 이름은 contracts `BuildingName`: 앞뒤 공백을 지운 뒤 1~40자(`BUILDING_NAME_MAX`), 보이지 않거나 방향을 바꾸는 문자 없음(유니코드 `\p{C}` 전부: 제어·서식(LRM·RLM·ALM·폭 없는 문자·BOM·태그 문자·방향 제어)·사용자 정의·미배정·짝 없는 서로게이트, 그리고 줄/문단 구분자), 결합 문자 세 개 이상 연속 없음, 한글 채움 문자(U+115F·1160·3164·FFA0)가 아닌 글자나 숫자 하나 이상(400). 주소는 API로 바꾸지 않습니다(‘주소가 다르거나 건물이 여러 개예요 → 팀에 알리기’). 이 기능 전에 초대를 수락한 건물은 마이그레이션이 첫 관리자가 생긴 시각으로 채웠습니다.
- **약관 동의(D-28):** `users.terms_version`·`terms_agreed_at`에 마지막으로 동의한 판과 시각을 둡니다. 로그인(카카오·시연)의 `consent`나 `POST /me/terms-consent`의 `version`이 지금 판(`TERMS_VERSION`)일 때만, 그리고 저장된 판과 다를 때만(`is distinct from`) 적습니다. 같은 판에 다시 동의해도 처음 시각을 유지합니다. `/me`는 `termsVersion`·`termsAgreedAt`·`termsUpToDate`(= 저장된 판이 지금 판)를 돌려주고, false여도 세션과 기능은 막지 않습니다(기존 세션 유지, 다시 묻는 것은 웹). `POST /me/terms-consent`에 이전 판을 보내면 409 `CONFLICT`(웹이 오래된 약관을 보여 준 경우)입니다. 판을 바꾸면 contracts `TERMS_VERSION`만 고치면 됩니다.
- **초대 수락:** `POST /manager-invites/accept`는 로그인이 필요하고, 본문의 토큰을 SHA-256으로 해시해 `manager_invites`에서 찾습니다. 만료는 410 `INVITE_EXPIRED`, 없거나 이미 수락된 초대는 404입니다. 수락과 `building_managers` 생성은 한 트랜잭션입니다. 이미 그 건물 관리자면 초대 상태를 바꾸지 않고 성공으로 응답합니다(웹은 관리 홈으로 이동, [screens.md §5](../lofi/screens.md#5-들어온-경로별-첫-화면)).
- **가입코드:** 6자리 영숫자입니다. 서버가 만드는 코드는 헷갈리는 글자(0·O·1·I·L)를 뺀 31자에서 `crypto.randomInt`로 고릅니다. 입력은 앞뒤 공백을 지우고 대문자로 바꾸며, 글자 사이의 공백이나 `-` 하나까지 받고 구분자를 뺀 뒤 비교합니다(contracts `JoinCodeInput`·`normalizeJoinCode`, 예: `wk7 2p4`). 집주인은 `GET …/join-code`로 현재 코드를 보고(`join_codes` 원문, database.md §10), `POST …/join-code`로 처음 만들거나 바꿉니다. 바꾸면 이전 코드는 `retired_at`이 채워져 더 이상 맞지 않고, 이미 연결된 거주자는 그대로입니다. 코드는 건물을 만들 때 자동으로 생기지 않습니다(웹이 null을 보면 만들기를 부름).
- **연결:** 가입코드(1/2)는 로그인 전에 받으므로 `join-code/check`로 먼저 확인하고(실패 횟수 말고는 부작용 없음), 로그인 뒤 `POST /buildings/:buildingId/occupancies`에서 코드를 다시 확인하고 연결합니다. 연결하면 `active`, `next_reconfirm_at`은 `RECONFIRM_INTERVAL_DAYS`(기본 365일, lofi 45 ‘1년에 한 번’) 뒤입니다. 이미 이 건물과 살아 있는 연결(active·reconfirm_needed)이 있으면 새로 만들지 않고 200 `alreadyConnected: true`입니다. 이때 재확인 요청 중이거나 `reconfirm_needed`였으면 지금 가입코드를 맞힌 것을 ‘아직 살아요’로 보고 `active`·`last_reconfirmed_at`·`next_reconfirm_at`을 갱신하고 `reconfirmed: true`를 돌려줍니다(오케스트레이터 결정). 다른 건물과 연결돼 있으면 웹이 기존 관계 변경을 확인받은 뒤 그 연결 id를 `replaceOccupancyId`로 보내야 하고, 없거나 다르면 409 `ALREADY_CONNECTED`입니다. 옮길 때는 기존 연결 종료(`inactive`, `ended_at`), 이 계정의 푸시 구독 전부 삭제(웹이 새 건물의 알림 선택을 다시 묻게, [screens.md §6](../lofi/screens.md#6-알림-환경)), 새 연결을 한 트랜잭션에서 처리하고, 새 연결이 실패하면 기존 연결과 구독이 그대로 남습니다. 같은 사용자의 동시 요청은 부분 유니크 인덱스에 걸려 409 `CONFLICT`입니다.
- **재확인:** 상태는 스케줄러 없이 읽을 때 계산합니다(`lib/reconfirm.ts`의 `occupancyState`, SQL은 `activeNow(now)`). SQL 조건도 DB 시계 대신 앱의 시각을 받고, 14일은 달력 날짜가 아니라 정확히 14×24시간이라 두 계산의 경계가 같습니다(`lib/reconfirm-sql.test.ts`). `next_reconfirm_at`도 앱 시각 + 일수×24시간으로 적습니다. `next_reconfirm_at`이 지나면 재확인 요청 중(`reconfirmRequested: true`, 시트 40·홈 배너)이고 여전히 active라 쓰기·알림은 그대로입니다. 그 뒤 14일(contracts `RECONFIRM_GRACE_DAYS`, `reconfirmDueAt`)까지 답이 없으면 `reconfirm_needed`로 보고 메모 쓰기·공지 알림 구독·알림 대상에서 빠지며 읽기는 유지됩니다. 이사로 처리하지 않습니다. DB `status`는 요청으로만 바뀌고 계산 결과를 저장하지 않습니다(조회로 상태를 바꾸지 않음). `/me`, 연결 응답, `requireOccupancy`, 공지 대상 수·발송 대상이 모두 같은 계산을 씁니다. ‘아직 살아요’(`POST …/reconfirm`)는 `active`로 두고 `last_reconfirmed_at`을 지금, `next_reconfirm_at`을 지금부터 `RECONFIRM_INTERVAL_DAYS` 뒤로 적습니다. 요청 전에 눌러도 받습니다. 주기를 바꾸면 그다음 연결·재확인부터 적용됩니다.
- **이사:** `POST …/move-out`은 `inactive`와 `ended_at`을 적습니다. 그 사람의 멤버 기능(메모 읽기·쓰기, 알림 구독)이 끝나고, 푸시 구독 행은 계정에 남지만 연결이 inactive라 이 건물의 알림 대상과 연결된 거주자 수에서 빠집니다. 메모(와 팁)는 건물에 남습니다. 다시 연결하려면 가입코드로 새 연결을 만듭니다.
- **가입코드 반복 제한:** 코드를 비교하기 **전에** (건물, 클라이언트 키)마다 시도를 한 번 셉니다(`join_code_attempts.failed_count`를 한 문장 upsert로 +1, 행 잠금 때문에 동시 요청도 서로 다른 번호를 받음). 키는 로그인했으면 사용자(`user:<id>`)만(IP를 바꿔도 풀리지 않음), 로그인하지 않았으면 IP 키(`ip:<HMAC>`, 아래 클라이언트 IP)입니다(오케스트레이터 결정). 이미 잠겼거나 이번 시도가 5번째를 넘으면 코드를 보지 않고 429 `JOIN_CODE_LOCKED`입니다. 그래서 한 키에서 한꺼번에 몇 번을 보내도 창(10분)마다 5번까지만 비교합니다. 5번째 시도가 틀리면 그 응답부터 429와 `Retry-After`(남은 초, 처음엔 600)이고, 잠금이 풀리거나 창이 지나면 1부터 다시 셉니다. 맞히면 그 키들의 기록을 지워 맞힌 시도가 한도를 쓰지 않습니다. 둘째 방어선으로 **로그인하지 않은 확인**만 건물 전체 키(`building`)로도 셉니다. 키 검사를 통과해 실제로 코드를 비교할 요청만 한 칸을 쓰고(잠긴 키의 요청은 쓰지 않음), 맞히면 잠기지 않은 동안 한 칸을 돌려받습니다(`greatest(failed_count - 1, 0)`). 그래서 한 IP가 계속 틀려도 5칸만 쓰고, 맞힌 거주자들은 건물을 잠그지 않습니다. 여러 IP에서 틀린 비교가 10분에 30번(`JOIN_CODE_BUILDING_MAX_ATTEMPTS`)을 넘으면 10분 동안 그 건물의 로그인하지 않은 확인이 429이고 경고 로그 `join_code_building_locked`(건물 id만)를 한 번 남깁니다. 로그인한 사람의 확인·연결은 이 상한을 쓰지도 막히지도 않습니다(사용자 키로만 제한). 시도 기록은 연결 트랜잭션 밖에서 남겨 오류로 되돌려지지 않고, 확인할 때마다 하루 넘게 쓰이지 않은 기록을 건물과 관계없이 100행까지 지웁니다. 브라우저 쿠키는 지우면 그만이라 키로 쓰지 않습니다.
- **클라이언트 IP:** `lib/client.ts`의 `resolveClientAddress`가 세 방식 중 하나로 정합니다.
  - `ORIGIN_VERIFY_SECRET`(§9)이 있으면: 요청의 `X-Origin-Verify` 헤더가 그 값과 같을 때만(SHA-256끼리 상수 시간 비교, 우리 CloudFront를 거친 요청) `X-Forwarded-For`를 믿습니다. 헤더가 없거나 틀리면 `X-Forwarded-For`를 보지 않고 소켓 주소입니다. 고르는 규칙(`pickForwardedClient`)은 dev에서 `GET /api/dev/whoami`로 잰 실제 체인 모양에 맞췄습니다.
    - 우리 CloudFront로 바로 오면 체인은 `[클라이언트]`, Amplify(`/api` rewrite)를 거치면 `[클라이언트, Amplify의 CloudFront 엣지, Amplify 프록시(EC2 ap-northeast-2)]`입니다(두 경우 첫 값이 같은 클라이언트).
    - 그래서 체인 길이 n이 3 이상이고 `chain[n-2]`가 CloudFront, `chain[n-1]`이 EC2 ap-northeast-2 대역이면 `chain[n-3]`을, 아니면 `chain[n-1]`을 씁니다. 고른 값이 IP가 아니거나 없으면 소켓 주소입니다. Amplify 프록시 주소를 그대로 쓰면 Amplify로 들어오는 모든 사람이 키 하나를 나눠 가져 한 사람의 5번 실패로 모두 잠기기 때문입니다.
    - `chain[n-1]`은 우리 CloudFront가 붙인 값이라 클라이언트가 꾸밀 수 없습니다. 왼쪽에 `가짜, <CloudFront 주소>`를 넣어 보내도 마지막 값이 보낸 사람의 실제 주소라 그 주소로 셉니다.
    - **남은 틈:** EC2 ap-northeast-2에서 보내는 사람은 Amplify 모양(`가짜, <CloudFront 주소>`)을 꾸며 요청마다 키를 고를 수 있습니다. 로그인하지 않은 가입코드 확인은 건물 전체 상한(10분 30번)이 막고, 제보는 비회원 건물 전체 상한(시간당 30건)이 막습니다.
    - 대역은 `lib/cloudfront-ranges.json`(AWS `ip-ranges.json`의 `CLOUDFRONT` 서비스와 `EC2`·`ap-northeast-2`의 IPv4·IPv6, `createDate`·`fetchedAt` 기록)이고 `pnpm --filter @wolgyeham/api ranges:cloudfront`로 갱신합니다. 앞단(CloudFront 원본 요청 헤더)과 SSM 설정은 오케스트레이터가 맡습니다.
  - 없고 `TRUSTED_PROXY_HOPS`가 n이면: `X-Forwarded-For`의 오른쪽에서 n번째 값(예전 방식, 대체용).
  - 둘 다 없으면 소켓 주소. 왼쪽 값은 클라이언트가 꾸밀 수 있어서 어느 방식에서도 그대로 믿지 않습니다.
  - 반복 제한에서는 주소를 묶어서 셉니다(`addressGroup`): IPv4는 그대로, IPv4-mapped IPv6(`::ffff:a.b.c.d`)는 IPv4로, IPv6는 /64로. 키 값은 이 묶음을 HMAC-SHA256한 것이고, HMAC 키는 `SESSION_SECRET`에서 HKDF-SHA256(info `wolgyeham/ip-key/v1`)으로 따로 만든 32바이트입니다(쿠키 서명 키를 그대로 쓰지 않음, `SESSION_SECRET`이 없으면 프로세스마다 새 난수 키). DB 값만으로 IP를 되돌려 찾기 어렵습니다.
  - 시연 모드에서는 `GET /api/dev/whoami`로 체인과 고른 주소를 확인합니다. 값이 틀려 프록시 주소가 잡히면 같은 엣지를 쓰는 사람끼리 잠금을 나눠 갖게 됩니다.
- **공지:** 제목 80자·본문 1000자 이하, `endsAt`은 `startsAt` 이후이고 지금보다 뒤여야 합니다(아니면 400). 게시 트랜잭션에서 `notices`와 `notice_deliveries`(대상 = 발송 시점에 재확인 기한을 반영해 `active`이고 푸시 구독이 하나라도 있는 거주자, 한 사람에 한 행)를 만들고 바로 응답합니다. 응답의 `attemptedCount`는 만든 발송 행 수(알림 대상 수)이고 도착·열람을 단정하지 않습니다. 푸시가 설정되지 않았으면 행은 만들되 0이고 보내지 않습니다. 실제 발송은 응답 뒤 `c.var.tasks`(`lib/tasks.ts`)에서 합니다: 대상의 브라우저 구독마다 동시에 최대 10개씩 보내고, 그 대상에게 처음 보내기 시작할 때 `attempted_at`을 적습니다. 발송 중 오류는 프로세스를 멈추지 않고 로그(`notice_push_failed`, `background_task_failed`)만 남기며, 공지는 이미 올라간 상태입니다(다시 올려 중복되지 않도록). 서버를 끌 때는 남은 발송을 마친 뒤 DB를 닫습니다. 공지 올리기 화면의 대상 수는 `GET …/notices/audience`(지금 active인 연결 수, 그중 구독이 있는 수. `reconfirm_needed`·`inactive`는 빠짐)입니다. 기간이 끝난 공지(`ends_at < now()`)는 공개 목록·현재 공지에서 빼고 상세는 410 `NOTICE_ENDED`입니다. `notices.status`를 `expired`로 바꾸는 작업은 아직 없고 판단은 항상 `ends_at`으로 합니다. 열람은 로그인한 사람이 공지 상세를 열 때 웹이 `POST /notices/:noticeId/opened`를 부르면 그 사람의 연결(지금 것·끝난 것)에 이 공지의 발송 행이 있을 때만 처음 한 번 `opened_at`을 적습니다(발송을 시도했는지와 관계없이 대상이었으면 기록). 대상이 아니었으면 아무것도 바꾸지 않고 똑같이 204입니다. 조회(GET)로는 기록하지 않습니다.
- **웹 푸시:** VAPID를 씁니다. 개인키는 서버 환경 변수에만 두고, 브라우저 구독에 필요한 공개키는 `GET /push-subscriptions/public-key`가 내려줍니다(보낼 수 없는 환경이면 null → 웹은 ‘지원 안 됨’ 상태). 구독은 active 거주자만 저장하고, `endpoint`는 알려진 브라우저 푸시 서비스의 https 주소만 받습니다(contracts `isAllowedPushEndpoint`: `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`). 해석기마다 호스트를 다르게 읽지 않도록(보안 리뷰: `https://attacker.example;.push.apple.com/x`를 WHATWG URL은 허용 호스트로, 레거시 `url.parse`는 `attacker.example`로 읽음) 공백·제어문자가 없고, https이며 계정 정보·포트가 없고, 호스트가 엄격한 소문자 DNS 이름이며, 원문이 정확히 `https://<호스트>/`로 시작해야 합니다. 서버가 이 주소로 요청을 보내므로(SSRF 방지) 발송할 때도 다시 확인하고 아니면 보내지 않습니다(`failed`, 경고 로그 `push_endpoint_rejected`). 이 규칙에 맞지 않던 기존 구독은 마이그레이션 `0008_push_endpoint_cleanup`이 지웠습니다. 사용자마다 최근에 저장한 5개만 남기고(저장과 같은 트랜잭션에서 오래된 것부터 지움), 저장은 사용자마다 10분에 10번까지입니다(429 `RATE_LIMITED`, `rate_limits`). 같은 endpoint를 다른 계정이 저장하면 이미 있는 구독의 `auth`(브라우저만 아는 비밀)가 같을 때만 그 계정으로 옮기고, 다르면 아무것도 바꾸지 않고 204입니다(endpoint만 알아서 남의 구독을 가져가지 못함). 삭제는 로그인한 본인 것만 지웁니다. 알림 내용은 contracts `NoticePushPayload`(`{ type: "notice", noticeId, buildingId, title, url }`, `url`은 `/b/:buildingId/notices/:noticeId`)이고 본문은 담지 않습니다. 실제 발송은 `lib/push.ts`의 `PushSender`(`isConfigured()`, `send()` → `sent`·`gone`·`failed`) 뒤에 두었고, `createApp({ push })`로 바꿀 수 있습니다(테스트는 가짜 발송기). 기본 발송기는 VAPID 키 세 개가 있을 때 보냅니다. 암호화·VAPID 헤더는 `web-push`(의존성, MPL-2.0)의 `generateRequestDetails`로 만들고(TTL 24시간), 요청은 `web-push`의 `sendNotification`(레거시 `url.parse`, 유휴 시간 제한만 있고 응답 본문을 끝까지 모음)을 쓰지 않고 `lib/push.ts`의 `sendHttps`가 보냅니다: 허용 목록 검사와 같은 WHATWG URL의 호스트로 443에 연결하고, 요청마다 새 `https.Agent`를 쓰며, 10초가 지나면 요청과 Agent를 모두 끊고, 응답 본문은 모으지 않고 64KB를 넘으면 끊습니다. 키 형식이 틀리면 API가 키 이름만 적은 오류로 시작하지 않습니다. 푸시 서비스가 404·410을 돌려준 구독(`gone`)은 지우고, 그 밖의 실패(429·5xx·네트워크·시간 초과)는 `push_subscriptions.failure_count`를 세어 3번 이어지면 지웁니다(보내는 데 성공하거나 다시 저장하면 0).
- **제보(집주인에게 알리기):** 비긴급 공용생활 상황만 받습니다. 본문은 둘 중 하나입니다. 자주 쓰는 말(`source: "preset"`, `preset` 키 `trash_overflow`·`passage_blocked`·`leak_or_broken` = 01·20의 세 문구, 종류는 contracts `REPORT_PRESET_KINDS`로 정해짐)에 덧붙일 내용(선택, 300자, 빈 문자열은 없음)을 붙이거나, 직접 적기(`source: "custom"`, 종류 `trash`·`passage`·`noise`·`facility`·`other`, 위치 선택 `alley`·`recycling_area`·`stairs_hallway`·`parking`, 내용 1~300자, 05)입니다. 사진은 아직 받지 않습니다. 누구나 보낼 수 있고(로그인 없이도) 그 건물 집주인만 403 `FORBIDDEN`입니다. 보낸 계정은 `reporter_user_id`에만 두고 집주인에게는 `reporterKind`만 보냅니다: 보낸 시점에 이 건물과 살아 있는 연결(active·reconfirm_needed)이 있으면 `resident`(거주자), 로그인했지만 이 건물 거주자가 아니면 `member`(회원, 내 정보에서 상태를 봄), 로그인하지 않았으면 `guest`(비회원, 확인 링크로 상태를 봄)입니다(오케스트레이터 결정). 제보 본문·덧붙인 내용은 줄바꿈 말고는 제어문자를 받지 않습니다(400, 아래 글자 검사). 집주인에게 보내는 받은 시각(`createdAt`)은 분 단위로 자르고(보낸 사람을 초 단위 시각으로 짐작하지 않게), 보낸 사람 화면에는 그대로 보냅니다. 로그인하지 않고 보냈으면 32바이트 난수 조회 토큰을 만들어 응답에 한 번만 담고(`accessToken`, `accessExpiresAt`), DB에는 SHA-256 해시와 만료 시각(30일, `REPORT_ACCESS_DAYS`)만 저장합니다. 로그인해서 보냈으면 토큰이 없고 내 정보 › 보낸 내용(`GET /me/reports`)에서 봅니다. 비회원 때 보낸 제보를 나중에 로그인한 계정에 붙이지 않습니다.
- **제보 보기:** `GET /reports/:reportId`는 그 건물 집주인(`viewer: "manager"`, `reporterKind` 포함), 이 계정으로 보낸 사람, `X-Report-Token` 헤더의 유효한 토큰(둘 다 `viewer: "reporter"`, 토큰이면 `accessExpiresAt`)만 봅니다. 토큰은 쿼리로 받지 않습니다(주소는 로그에 남기 때문. 웹 URL의 `#t=` 뒤에만 둠). 토큰이 없거나 틀리거나 다른 제보의 토큰이면 404로 숨기고, 만료면 410 `REPORT_LINK_EXPIRED`입니다. 만료된 지 30일이 지난 토큰 행은 제보를 받을 때마다 100행씩 지우므로 그 뒤에는 404입니다. 보기만 해서는 상태가 바뀌지 않습니다. 공개 QR 주소만으로 보낸 사람을 식별하지 않습니다.
- **같은 브라우저 재조회(30):** 웹은 만든 응답의 `report.id`와 `accessToken`을 이 브라우저에 건물별로 보관하고, 공개 화면을 열 때 `POST /buildings/:buildingId/reports/lookup`에 그 건물의 토큰(1~20개, 본문)을 보냅니다. 응답은 토큰과 같은 순서로 이 건물의 유효한 제보, 없거나 만료됐거나 다른 건물의 토큰 자리는 null이라 웹은 null인 토큰을 지웁니다. 상태를 바꾸지 않는 조회지만 토큰을 주소에 넣지 않으려고 POST 본문으로 받습니다. 로그인한 사람의 ‘내가 보낸 내용’은 `GET /me/reports`를 건물로 거르면 됩니다.
- **제보 처리:** 집주인만 합니다(다른 사람은 403 `NOT_BUILDING_MANAGER`, 없는 제보 404). `POST …/acknowledge`는 `received` → `acknowledged`(‘확인했어요’ 버튼으로만), `POST …/resolve`는 `acknowledged` → `completed`·`unable`이고 `note`(보낸 분께 한 줄)를 함께 적습니다. `note`는 결과와 관계없이 선택이고(lofi 35, 빈 문자열은 없는 것으로 저장), 있으면 줄바꿈 없이 100자(`REPORT_RESULT_NOTE_MAX`) 이하입니다(아니면 400). 확인 전에 결과를 남기거나 이미 바뀐 제보를 다시 바꾸면 조건부 UPDATE가 0건이라 409 `CONFLICT`입니다. 제보 원문은 공지·안내에 자동으로 옮기지 않습니다. 집주인에게 새 제보 알림(웹 푸시)은 보내지 않습니다(파일럿은 팀이 카톡으로 전함, screens.md §6). 관리 홈의 ‘확인할 것’·받은 내용 탭은 `GET /manage/buildings`의 `newReportCount`(`received` 수)와 `GET /buildings/:buildingId/reports?status=received`를 씁니다.
- **반복 접수 제한(제보):** 키는 로그인했으면 `user:<id>`, 아니면 IP 키(가입코드와 같은 HMAC·주소 묶음)입니다. 같은 키가 같은 건물에 같은 문구를 10분(`REPORT_REPEAT_MINUTES`) 안에 다시 보내면 429 `REPORT_TOO_FREQUENT`, 한 시간에 10건(`REPORT_HOURLY_LIMIT`)을 넘기면 429 `RATE_LIMITED`이고 둘 다 `Retry-After`(남은 초)를 붙입니다. ‘같은 문구’는 NFKC·소문자로 바꾸고 공백과 흔한 문장부호를 뺀 뒤 비교합니다(자주 쓰는 말은 키 + 덧붙인 내용, 직접 적기는 내용). 기록은 Postgres `report_submissions`(제보 한 건마다 한 행, 문구는 SHA-256만)에 두고, 확인·제보·기록·토큰은 (건물, 키) advisory lock 아래 한 트랜잭션이라 동시 요청도 하나만 들어갑니다. 받아들인 제보만 기록하고, 하루가 지난 기록은 제보를 받을 때마다 건물과 관계없이 100행씩 지웁니다. 통신사 NAT처럼 비회원 여러 명이 IP 하나를 나눠 쓰면 제한을 함께 받습니다. 여러 IP로 나눠 보내는 스팸을 막으려고 **비회원** 제보는 건물 전체로도 세어 한 시간에 30건을 넘으면 429 `RATE_LIMITED`(`Retry-After` 600)입니다. 회원 제보는 이 상한에 걸리지 않습니다. 건물 단위 advisory lock을 먼저 잡고 키 단위 lock을 잡아 순서가 꼬이지 않습니다.
- **생활 팁:** 종류(`recycling`·`parcel`·`winter`·`common`·`other` = 분리수거·택배·겨울·공용공간·기타, 19)와 내용(1~200자)만 받습니다. 쓰기는 그 건물 active 거주자만(재확인 필요면 403 `RECONFIRM_NEEDED`, 집주인 403 `FORBIDDEN`), 읽기는 active·reconfirm_needed 거주자와 집주인입니다. 작성자는 `author_user_id`에만 두고 응답에는 요청한 사람이 쓴 팁인지(`mine`)만 붙이며, 날짜는 작성 월(`createdMonth`, Asia/Seoul `YYYY-MM`)만 줍니다(정확한 시각 없음). 고치기·지우기는 작성자 본인이 그 팁의 건물과 아직 연결돼 있을 때(active·reconfirm_needed)만 하고, 남의 팁·지운 팁은 404, 이사한 뒤에는 403 `NOT_CONNECTED`입니다(운영팀 요청으로 처리). 운영팀이 가린 팁이나 검토 전 신고가 있는 팁은 고칠 수 없습니다(409 `CONFLICT`, 조건부 UPDATE. 신고된 내용을 바꿔 검토를 피하지 못하게). 지우기는 `deleted_at`만 채우는 소프트 삭제라 목록·관리 홈 팁 수·`/me/tips`에서 빠지지만 행·신고·운영 기록은 남습니다. 이사해도 팁은 건물에 남습니다. 내용은 줄바꿈 말고는 제어문자를 받지 않습니다. `GET /me/tips`는 내가 쓴 팁을 모든 건물에서 보여주고, 운영팀이 가린 팁은 `hidden: true`, 지금 그 건물과 연결돼 있으면 `editable: true`입니다.
- **콘텐츠 신고와 운영자 가림(LF-19):** 팁 신고는 그 건물 active·reconfirm_needed 거주자와 집주인이 하고(사유 선택, 한 줄 200자, 제어문자 없음), 한 사람이 한 팁에 한 번입니다(`content_reports` 유니크, 다시 하면 200 `alreadyReported: true`). 신고할 때의 팁 내용을 `content_reports.tip_body`에 남겨 작성자가 나중에 지워도 운영자가 신고된 내용을 봅니다. 본인 팁은 403 `FORBIDDEN`, 가린 팁·지운 팁은 404입니다. 신고만으로는 가려지지 않고 운영팀이 `pnpm --filter @wolgyeham/api db:moderate list`로 검토 전 신고가 있거나 가린 팁(지운 팁 포함)을 보고, `hide <tipId> --by <운영자> [사유]` 또는 `restore <tipId> --by <운영자>`로 가리거나 복원합니다(배포 이미지에서는 `node moderate.mjs …`). `--by`가 없으면 실행하지 않습니다. 가리면 `tips.hidden_at`·`hidden_reason`이 채워져 팁 목록·관리 홈 팁 수에서 빠지고, 가리거나 복원하면 그 팁의 검토 전(`open`) 신고가 `reviewed`가 되며 `moderation_actions`에 (팁, 동작, 사유, 운영자, 시각)을 같은 트랜잭션에서 남깁니다. 복원해도 이전 기록은 지우지 않습니다. 목록 출력은 사용자가 쓴 글의 제어문자를 `\u{..}`로 바꿔 찍어 터미널을 조작하지 못하게 합니다. 운영자 웹 화면과 운영자 권한 모델은 아직 없습니다.
- **글자 검사:** 사람이 쓰는 글(팁 내용, 제보 본문·덧붙인 내용, 수정 메모 본문)은 줄바꿈(`\n`) 말고는 제어문자(U+0000–U+001F, U+007F–U+009F)를 받지 않고, 한 줄 글(팁 신고 사유, 처리 결과 한 줄, 수정 메모 기존 유지 사유)은 줄바꿈도 받지 않습니다(contracts `MULTILINE_TEXT`·`SINGLE_LINE_TEXT`, 400).
- **목록 상한:** 페이지 나누기가 아직 없어서 목록은 최근 순으로 잘라 돌려줍니다: 안내 아래 메모 100, 집주인 메모 200, 받은 제보 200, 내 제보 100, 건물 팁 200, 내 팁 100.

## 8. 로그

- 이벤트마다 JSON 한 줄을 남깁니다: `{ level, event, time, requestId, ... }`.
- `app.use(requestId())`(`hono/request-id`)로 요청 ID를 정합니다. 들어온 `X-Request-Id`가 있으면 그대로 쓰고, 없으면 UUID를 만들며, 응답 헤더에도 붙입니다.
- 요청 로그(`event: "request"`, 테스트에서는 끔)에는 등록된 경로 패턴(`hono/route`의 `routePath(c, -1)`, 예: `/api/reports/:reportId`)을 남깁니다. 실제 URL과 쿼리는 토큰이 섞일 수 있으므로 남기지 않습니다.
- `/api` 응답에는 모두 `Cache-Control: no-store`를 붙입니다. 문서 경로(`/api/docs`, `/api/swagger`, `/api/openapi.json`)만 뺍니다.
- 반복 제한·보안 경고: `join_code_building_locked`(건물 id), `push_endpoint_rejected`(값 없음). 응답 뒤 할 일 실패: `background_task_failed`(할 일 이름과 오류 이름만). 시연 초기화: `demo_reset`(되돌린 건물 수만). IP·토큰·endpoint·오류 메시지는 넣지 않습니다.
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
| `SESSION_SECRET` | 로그인 중에 쓰는 짧은 쿠키(`state`·`returnTo`) 서명, 그리고 HKDF로 따로 만든 반복 제한 IP 키의 HMAC 키(§7). 세션 토큰 자체는 해시로 저장하므로 이 값과 무관. 32자 이상, 카카오 키가 있으면 필수. 바꾸면 진행 중인 가입코드 잠금·제보 제한 기록이 새 키와 이어지지 않음 |
| `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI` | 카카오 로그인. 키가 없으면 503 `KAKAO_NOT_CONFIGURED`. `KAKAO_REDIRECT_URI`를 비우면 `${APP_ORIGIN}/api/auth/kakao/callback` |
| `DEMO_MODE` | `true`면 시연 로그인(§6)을 엽니다. 기본 `false`. dev는 `true`, prod는 `false` |
| `API_DOCS` | `true`·`false`. API 문서(`/api/swagger`, `/api/docs`, `/api/openapi.json`)를 붙일지. 비우면 `NODE_ENV=production`에서만 끔. 배포 이미지는 `production`이라 dev 서버에서 문서를 보려면 SSM에 `API_DOCS=true`가 필요 |
| `RECONFIRM_INTERVAL_DAYS` | 연결·‘아직 살아요’ 뒤 재확인을 요청하기까지의 일수(1~3650, 기본 365 = ‘1년에 한 번’). 요청 뒤 14일 무응답이면 reconfirm_needed(§7). 시드(`db:seed`)도 읽음 |
| `ORIGIN_VERIFY_SECRET` | 앞단(CloudFront)이 원 서버로 보낼 때 붙이는 `X-Origin-Verify` 헤더 값(32자 이상). 있으면 이 헤더가 맞는 요청에서만 `X-Forwarded-For`를 믿고 체인 모양(바로 온 요청은 마지막 값, Amplify를 거친 요청은 끝에서 세 번째)으로 클라이언트 IP를 고릅니다(§7). 비우면 `TRUSTED_PROXY_HOPS` 방식. 로컬은 비움, 배포 값은 SSM |
| `TRUSTED_PROXY_HOPS` | 요청 앞의 신뢰하는 프록시 수(0~5, 기본 0). 가입코드 반복 제한의 클라이언트 IP를 `X-Forwarded-For` 오른쪽에서 이 번째 값으로 봄(§7). 로컬은 0 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | 웹 푸시(§7). 셋을 함께 넣거나 모두 비움(하나만 있으면 시작 실패, 키 형식이 틀려도 시작 실패). `VAPID_SUBJECT`는 `mailto:` 또는 `https://`. 비우면 공지 알림을 보내지 않고 공개키 응답이 null. 키 만들기: `pnpm --filter @wolgyeham/api exec web-push generate-vapid-keys`. 개인키는 로컬 `apps/api/.env`와 SSM에만 |

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
- 웹 푸시는 `useTestApp(env, { push })`에 가짜 `PushSender`를 넘겨 보낸 내용과 endpoint별 결과(`gone`·`failed`)를 정합니다(`modules/notices/push.test.ts`). 기본 발송기는 `web-push`를 모킹하지 않고(암호화·VAPID·`url.parse`를 실제로 거침) `vi.spyOn(https, "request")`로 네트워크만 가로채, 연결하는 호스트·VAPID audience·결과 매핑·10초 제한·64KB 제한·허용하지 않은 주소(해석기 차이 주소 포함)를 봅니다(`lib/push.test.ts`). 실제 푸시 서비스는 테스트하지 않습니다.
- 시연 건물 행을 지우고 다시 만드는 테스트(`resetDemo`, `POST /api/dev/reset`, `GET /api/dev/demo`)는 `db/seed.test.ts` 한 파일에 둡니다. 파일끼리 병렬로 돌 때 다른 파일의 초기화가 Given을 지우지 않도록 한 파일 안에서 차례로 돌립니다. 초기화 제한에는 모든 사람 합친 것도 있어 테스트마다 `rate_limits`의 초기화 버킷 네 개를 지우고 시작하고, 같은 사람 제한은 `TRUSTED_PROXY_HOPS=1`과 `X-Forwarded-For`로 주소를 바꿔 봅니다.
- 응답 뒤에 도는 일(공지 푸시)은 `useTestApp`이 넘기는 `t.tasks`의 `idle()`을 기다린 뒤 확인합니다.
- 동시 요청 경계는 `Promise.all`로 같은 요청을 한꺼번에 보내 봅니다. 가입코드 비교 횟수는 `vi.mock`으로 현재 코드 조회를 감싸 셉니다(`modules/buildings/join-code-race.test.ts`).
- 트랜잭션이 되돌려지는지는 `vi.mock`으로 repo 함수 하나를 실패시켜 봅니다(`modules/occupancies/occupancies.test.ts`의 건물 전환, `modules/guides/revisions.test.ts`의 수정 공개).
- 재확인 계산은 `lib/reconfirm.test.ts`에서 정한 시각을 넘겨 보고, 라우트 테스트는 `createOccupancy(…, { nextReconfirmAt })`로 기한을 과거에 둡니다. 설정값은 `useTestApp({ RECONFIRM_INTERVAL_DAYS: "30" })`처럼 바꿉니다(`modules/occupancies/reconfirm.test.ts`).
- 클라이언트 IP가 필요한 테스트는 `TRUSTED_PROXY_HOPS=1`로 앱을 만들고 `X-Forwarded-For`를 붙입니다. `app.request()`에는 소켓이 없어 그렇지 않으면 모든 요청이 같은 IP(`unknown`)로 셉니다.

## 바꿀 때

- 이 문서와 API 규칙은 PR로 바꿉니다. 오류 형식, 인증 방식, 모듈 구조처럼 결정이 바뀌면 [decisions.md](decisions.md)에 기록합니다.
- 순서는 항상 계약(`packages/contracts`) → API → 웹입니다. 계약을 깨는 변경은 양쪽을 같은 PR에서 고칩니다.
- 권한·상태 규칙이 [lofi/screens.md](../lofi/screens.md)와 다르면 screens.md를 먼저 고치고 이 문서는 링크를 유지합니다.
