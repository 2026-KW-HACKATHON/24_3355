# 데이터베이스 가이드

월계함의 PostgreSQL 스키마 규칙, 테이블 구성, 마이그레이션·시드·백업 방법입니다. 새 테이블과 컬럼은 이 문서의 규칙으로 만듭니다.

기준: [lofi/screens.md §2 데이터 귀속](../lofi/screens.md#2-데이터-귀속)·[§3 상태 전이](../lofi/screens.md#3-상태-전이)·[§4 작성자 정책](../lofi/screens.md#4-작성자-정책), `packages/contracts` · 담당 영역: 백엔드 `apps/api`, 공통 계약 `packages/contracts` ([CONTRIBUTING.md §2](../CONTRIBUTING.md#2-담당-영역))

함께 읽기: [backend.md](backend.md) · [architecture.md](architecture.md) · [deploy.md](deploy.md) · [decisions.md](decisions.md)

## 1. 현재 상태

| 항목 | 상태 |
|---|---|
| 로컬 PostgreSQL 17 (`infra/compose.yaml`, `127.0.0.1:54329`, DB `wolgyeham`) | 있음 (`pnpm db:up`, `pnpm db:down`) |
| `DATABASE_URL` 샘플 | `apps/api/.env.example`에 있음 |
| Drizzle ORM + drizzle-kit, `apps/api/src/db/schema.ts`, `apps/api/drizzle/` | 있음([decisions.md](decisions.md) D-05). 구현 순서 A의 테이블(`0000_init`): `users`, `sessions`, `buildings`, `building_managers`, `manager_invites`, `guides`, `notices` |
| 구현 순서 B의 테이블(`0001_slice_b_occupancies`) | 있음: `join_codes`, `join_code_attempts`, `occupancies`, `push_subscriptions`, `notice_deliveries`, `notices` 제목·본문 글자 수 CHECK |
| 구현 순서 C의 테이블(`0002_slice_c_memos_revisions`) | 있음: `guide_revisions`, `correction_memos`. 구현 순서 D(재확인·이사)는 `occupancies`의 기존 컬럼만 씀 |
| 구현 순서 E의 테이블(`0003_slice_e_reports`) | 있음: `reports`, `report_access_tokens`, `report_submissions`(반복 접수 제한) |
| 구현 순서 F의 테이블(`0004_slice_f_tips`) | 있음: `tips`(운영자 가림 `hidden_at`·`hidden_reason`), `content_reports` |
| 제보 보낸 사람 구분 3값·처리 한 줄 선택(`0006_report_kinds_optional_note`) | 있음: `reports.reporter_kind`에 `member` 추가, unable일 때 `result_note` 필수 CHECK 제거 |
| 보안 보강(`0007_security_hardening`) | 있음: `moderation_actions`(운영 기록), `rate_limits`(고정 창 횟수 제한), `push_subscriptions.failure_count`, `tips.deleted_at`(소프트 삭제), `content_reports.tip_body`(신고할 때 내용), 정리용 인덱스(`join_code_attempts.updated_at`, `report_access_tokens.expires_at`, `report_submissions.created_at`) |
| 푸시 구독 주소 정리(`0008_push_endpoint_cleanup`, 직접 쓴 SQL) | 있음: contracts `isAllowedPushEndpoint`와 같은 규칙에 맞지 않는 `push_subscriptions` 행을 지움 |
| 건물 확인·약관 동의(`0009_building_confirm_terms_consent`) | 있음: `buildings.confirmed_at`(LF-12·23 건물 확인), `users.terms_version`·`terms_agreed_at`(D-28, CHECK 둘 다 null이거나 둘 다 있음·판 64자 이하). 이미 관리자가 있던 건물은 첫 관리자가 생긴 시각으로 채움(생성 SQL 뒤에 직접 붙인 UPDATE) |
| 사용자 외래 키 인덱스(`0005_user_fk_indexes`) | 있음: `guides`·`guide_revisions`·`notices`의 작성자, `join_codes.created_by_user_id`, `manager_invites.accepted_by_user_id`, `content_reports.reporter_user_id` |
| 스크립트 `db:generate`, `db:migrate`, `db:seed`, `db:invite`, `db:moderate` | 있음. `apps/api/package.json`, 루트는 `db:migrate`·`db:seed` |
| 테스트 DB `wolgyeham_test` | 있음. 로컬은 아래 명령으로 한 번 만듦, CI는 Postgres 서비스 |

```bash
pnpm db:up       # Postgres 컨테이너 시작 (healthcheck 통과까지 대기)
pnpm db:migrate  # apps/api/drizzle/의 SQL을 DATABASE_URL(apps/api/.env)에 적용
pnpm db:seed     # 시연 데이터 (§8). 여러 번 실행해도 같은 상태
docker compose -f infra/compose.yaml exec db psql -U wolgyeham wolgyeham        # 접속
docker compose -f infra/compose.yaml exec db createdb -U wolgyeham wolgyeham_test # 테스트 DB 한 번 생성
pnpm --filter @wolgyeham/api db:generate   # schema.ts를 고친 뒤 SQL 마이그레이션 생성
pnpm --filter @wolgyeham/api db:invite <buildingId> [유효 일수]   # 집주인 초대 링크 한 번 출력
pnpm --filter @wolgyeham/api db:moderate list                     # 신고된·가린 팁 (운영자, LF-19)
pnpm --filter @wolgyeham/api db:moderate hide <tipId> --by <운영자> [사유]   # 팁 가림 / restore <tipId> --by <운영자>로 복원
pnpm --filter @wolgyeham/api ranges:cloudfront                   # lib/cloudfront-ranges.json 갱신(AWS ip-ranges.json의 CloudFront·EC2 ap-northeast-2)
```

## 2. 도구와 위치

| 대상 | 위치 |
|---|---|
| 스키마 (Drizzle) | `apps/api/src/db/schema.ts` |
| 생성된 SQL 마이그레이션 | `apps/api/drizzle/` (커밋함) |
| DB 클라이언트 | `apps/api/src/lib/db.ts` |
| 공개 API 스키마 | `packages/contracts`. drizzle-zod로 insert 스키마를 만들 수는 있지만 API 계약은 contracts에만 둠 |

## 3. 명명·컬럼 규칙

| 항목 | 규칙 |
|---|---|
| 테이블 | snake_case 복수형 (`correction_memos`) |
| 기본 키 | `id uuid primary key default gen_random_uuid()` |
| 시각 | `created_at`, `updated_at`: `timestamptz not null default now()`. 다른 시각도 `timestamptz` (`published_at`, `expires_at`) |
| 상태 | `text` + CHECK. Postgres enum은 쓰지 않음. 값 목록은 contracts의 zod enum과 같게 둠 |
| 외래 키 | `<대상 단수>_id`. `ON DELETE`를 항상 명시 (`cascade` 또는 `set null`) |
| 유니크 | `<table>_<cols>_key` (예: `users_kakao_user_id_key`) |
| 인덱스 | `<table>_<cols>_idx`. 조회에 쓰는 외래 키마다 둠 |
| 글자 수 제한 | `CHECK (char_length(body) <= N)`과 contracts의 `z.string().max(N)`을 함께 둠 |
| 비밀·토큰 | SHA-256 해시만 저장 (`token_hash`). 예외는 §7 |

- 호수(방 번호) 컬럼은 어디에도 두지 않습니다. 사람과 건물의 관계만 다룹니다.
- DB 컬럼은 snake_case, API 필드는 camelCase입니다. 변환은 `repo.ts`에서 합니다.
- 월 단위 표시(팁 작성 월 등)는 `Asia/Seoul` 기준으로 계산합니다. 저장은 `timestamptz`입니다.

```ts
// apps/api/src/db/schema.ts (형태 예시. 실제 파일은 CHECK 목록을 contracts 상수로 만듦)
import { GUIDE_STATUSES } from "@wolgyeham/contracts";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const guides = pgTable(
  "guides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: GUIDE_STATUSES }).notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("guides_status_check", sql`${t.status} in ('draft', 'published')`),
    index("guides_building_id_status_idx").on(t.buildingId, t.status),
  ],
);
```

## 4. 테이블

[screens.md §2 데이터 귀속](../lofi/screens.md#2-데이터-귀속)의 엔터티를 테이블로 옮긴 초안입니다. 모든 테이블에 `id`, `created_at`, `updated_at`이 있으므로 표에서는 뺍니다. 괄호 안은 `ON DELETE` 동작입니다.

```mermaid
erDiagram
  users ||--o{ sessions : ""
  users ||--o{ push_subscriptions : ""
  users ||--o{ building_managers : ""
  users ||--o{ occupancies : ""
  buildings ||--o{ building_managers : ""
  buildings ||--o{ manager_invites : ""
  buildings ||--o{ join_codes : ""
  buildings ||--o{ join_code_attempts : ""
  buildings ||--o{ occupancies : ""
  buildings ||--o{ guides : ""
  guides ||--o| guide_revisions : "수정본"
  guides ||--o{ correction_memos : ""
  buildings ||--o{ notices : ""
  notices ||--o{ notice_deliveries : ""
  occupancies ||--o{ notice_deliveries : ""
  buildings ||--o{ reports : ""
  reports ||--o{ report_access_tokens : ""
  buildings ||--o{ report_submissions : "반복 제한"
  buildings ||--o{ tips : ""
  tips ||--o{ content_reports : ""
  users |o--o{ tips : "작성자(내부)"
  users |o--o{ correction_memos : "작성자(내부)"
  users |o--o{ reports : "보낸 계정"
  users |o--o{ content_reports : "신고한 사람"
```

**계정**

| 테이블 | 주요 컬럼 | 제약·인덱스 |
|---|---|---|
| `users` | `kakao_user_id text`, `terms_version`·`terms_agreed_at`(마지막으로 동의한 약관 판과 시각, 없으면 둘 다 null) | `users_kakao_user_id_key`, CHECK `users_terms_check`. 닉네임·프로필 사진·실명은 저장하지 않음 |
| `sessions` | `user_id`(cascade), `token_hash`, `expires_at`, `last_seen_at` | `sessions_token_hash_key`, `sessions_user_id_idx` |
| `push_subscriptions` | `user_id`(cascade), `endpoint`, `p256dh`, `auth`, `failure_count`(404·410이 아닌 이어진 실패 수, 3이면 지움) | `push_subscriptions_endpoint_key`, `push_subscriptions_user_id_idx`. 브라우저마다 한 행. 사용자마다 최근 `updated_at` 5개만 남김(저장 트랜잭션에서) |

**건물·관리·연결**

| 테이블 | 주요 컬럼 | 제약·인덱스 |
|---|---|---|
| `buildings` | `name`(집주인이 고침, 1~40자 한 줄은 contracts `BuildingName`에서 검사), `display_address`(도로명까지), `full_address`(팀 확인값, 공개 안 함, API로 바꾸지 않음), `status` preparing·open, `opened_at`, `confirmed_at`(집주인이 건물 확인을 처음 마친 시각, null이면 확인 전) | CHECK `status`, CHECK `status = 'preparing' or opened_at is not null`. 이름 길이 CHECK는 두지 않음(팀이 직접 넣은 기존 행 때문에 마이그레이션이 실패하지 않게) |
| `manager_invites` | `building_id`(cascade), `token_hash`, `status` issued·accepted·expired, `expires_at`, `accepted_by_user_id`(set null), `accepted_at` | `manager_invites_token_hash_key`, CHECK `status`. 초대 유효 기간은 정할 것 |
| `building_managers` | `building_id`(cascade), `user_id`(cascade), `invite_id`(set null) | `building_managers_building_id_user_id_key`, `building_managers_user_id_idx` |
| `join_codes` | `building_id`(cascade), `code`(구분자 없는 대문자 6자리 원문), `created_by_user_id`(set null), `retired_at` | CHECK `code ~ '^[A-Z0-9]{6}$'`. 현재 코드는 `retired_at is null`. 건물마다 하나: 부분 유니크 `join_codes_building_id_current_key`. 바꾼 코드는 지우지 않고 `retired_at`을 채워 이력으로 둠 |
| `join_code_attempts` | `building_id`(cascade), `client_key`(`ip:<HMAC-SHA256>`, `user:<uuid>`, 또는 건물 전체 `building`), `failed_count`(창 안의 시도 수. 비교 전에 셈. `building` 행은 로그인하지 않은 확인 중 실제로 비교한 수이고 맞히면 하나 돌려받음), `window_started_at`, `locked_until` | `join_code_attempts_building_id_client_key_key`, `join_code_attempts_updated_at_idx`(정리용). 가입코드 시도 횟수(backend.md §7). 맞히면 그 사람의 키 행을 지우고(건물 행은 남김), 하루 넘게 쓰이지 않은 행은 확인 요청마다 건물과 관계없이 100행씩 지움 |
| `occupancies` | `building_id`(cascade), `user_id`(cascade), `status` active·reconfirm_needed·inactive, `connected_at`, `last_reconfirmed_at`(‘아직 살아요’), `next_reconfirm_at`(재확인 요청 시각: 연결·재확인 뒤 `RECONFIRM_INTERVAL_DAYS`, 기본 365일), `ended_at` | CHECK `status`, CHECK `status <> 'inactive' or ended_at is not null`. 사용자마다 살아 있는 연결 하나: 부분 유니크 `occupancies_user_id_live_key` (`status <> 'inactive'`), `occupancies_building_id_status_idx` |

**안내·공지**

| 테이블 | 주요 컬럼 | 제약·인덱스 |
|---|---|---|
| `guides` | `building_id`(cascade), `category`, `title`, `body`, `photos jsonb`, `position`, `status` draft·published, `published_at`, `author_user_id`(set null) | CHECK `status`, CHECK `status = 'draft' or published_at is not null`, `guides_building_id_status_idx` |
| `guide_revisions` | `guide_id`(cascade), `category`, `title` ≤80, `body` ≤2000, `author_user_id`(set null). 저장 시각은 `updated_at` | `guide_revisions_guide_id_key`(안내마다 하나), CHECK `category`·글자 수. 공개된 안내의 아직 공개하지 않은 수정본 |
| `correction_memos` | `guide_id`(cascade), `author_user_id`(set null), `body` ≤200, `status` pending·applied·kept, `kept_reason` ≤200, `resolved_at` | CHECK 글자 수·`status`, CHECK `status <> 'kept' or kept_reason is not null`, CHECK `(status = 'pending') = (resolved_at is null)`, `correction_memos_guide_id_status_idx`, `correction_memos_author_user_id_idx` |
| `notices` | `building_id`(cascade), `title` ≤80, `body` ≤1000, `starts_at`, `ends_at`, `status` published·expired, `author_user_id`(set null), `published_at` | CHECK `ends_at >= starts_at`·글자 수, `notices_building_id_ends_at_idx` |
| `notice_deliveries` | `notice_id`(cascade), `occupancy_id`(cascade), `attempted_at`, `opened_at` | `notice_deliveries_notice_id_occupancy_id_key`, `notice_deliveries_occupancy_id_idx`. 행 하나가 알림 대상 한 명. `opened_at`은 그 사람이 공지를 처음 열 때 한 번(`POST /notices/:noticeId/opened`) |

**제보·팁**

| 테이블 | 주요 컬럼 | 제약·인덱스 |
|---|---|---|
| `reports` | `building_id`(cascade), `reporter_user_id`(set null, 로그인해서 보냈을 때), `reporter_kind` guest·member·resident(보낸 시점), `preset`(자주 쓰는 말 키, 직접 적기면 null), `kind`, `location`(선택), `body` ≤300(직접 적은 내용·덧붙인 내용, 없으면 null), `status` received·acknowledged·completed·unable, `result_note` ≤100, `acknowledged_at`, `resolved_at` | CHECK 값 목록·글자 수, CHECK `preset is not null or body is not null`, CHECK `status = 'received' or acknowledged_at is not null`, CHECK `(status in (completed, unable)) = (resolved_at is not null)`, `reports_building_id_status_idx`, `reports_reporter_user_id_idx`. 사진은 아직 없음 |
| `report_access_tokens` | `report_id`(cascade), `token_hash`, `expires_at`(발급 후 30일) | `report_access_tokens_token_hash_key`, `report_access_tokens_report_id_idx`, `report_access_tokens_expires_at_idx`. 만료된 지 30일이 지난 행은 제보를 받을 때마다 100행씩 지움. 비회원이 보낼 때만 한 행 |
| `report_submissions` | `building_id`(cascade), `client_key`(`user:<uuid>` 또는 `ip:<HMAC-SHA256>`), `content_hash`(정규화한 문구의 SHA-256) | `report_submissions_building_id_client_key_created_at_idx`. 받아들인 제보마다 한 행(반복 접수 제한, backend.md §7). `report_submissions_created_at_idx`. 하루 지난 행은 제보를 받을 때마다 건물과 관계없이 100행씩 지움. 비회원(`ip:`) 행은 건물 전체 시간당 상한(30)에도 씀 |
| `tips` | `building_id`(cascade), `author_user_id`(set null), `category`, `body` ≤200, `hidden_at`, `hidden_reason` ≤200(운영자 가림), `deleted_at`(작성자 삭제, 소프트 삭제) | CHECK 값 목록·글자 수, CHECK `hidden_reason is null or hidden_at is not null`, `tips_building_id_idx`, `tips_author_user_id_idx` |
| `content_reports` | `tip_id`(cascade), `reporter_user_id`(set null), `reason` ≤200(선택), `tip_body`(신고할 때의 팁 내용, 0007 전 행은 null), `status` open·reviewed, `reviewed_at` | `content_reports_tip_id_reporter_user_id_key`(한 사람이 한 팁에 한 번), CHECK `(status = 'open') = (reviewed_at is null)`, `content_reports_status_idx`, `content_reports_reporter_user_id_idx`. 운영자가 가리거나 복원하면 그 팁의 open 신고가 reviewed |
| `moderation_actions` | `tip_id`(cascade), `action` hide·restore, `reason` ≤200, `operator`(1~100자, `db:moderate --by`) | CHECK 값·글자 수, `moderation_actions_tip_id_idx`. 가림·복원마다 같은 트랜잭션에서 한 행, 지우지 않음 |
| `rate_limits` | `bucket`, `subject_key`, `hit_count`, `window_started_at` | `rate_limits_bucket_subject_key_key`, `rate_limits_updated_at_idx`. 고정 창 횟수 제한(`lib/rate-limit.ts`: `push_subscribe` 사용자마다 10분에 10번, 시연 초기화 `demo-reset-interval` 30초에 1번·`demo-reset-hourly` 한 시간에 20번, 둘 다 키 `all` 하나). 하루 넘게 쓰이지 않은 행은 부를 때마다 100행씩 지움 |

- 안내 `category`는 contracts `GUIDE_CATEGORIES`(`recycling`·`parcel`·`facility`·`common`·`contact` = 분리수거·택배·보일러·설비·공용공간·연락, 로파이 33)와 CHECK로 정했습니다. 안내 제목·본문은 80·2000자 이하입니다. 팁 `category`는 contracts `TIP_CATEGORIES`(`recycling`·`parcel`·`winter`·`common`·`other`, 로파이 19), 제보 `kind`·`location`·`preset`은 `REPORT_KINDS`·`REPORT_LOCATIONS`·`REPORT_PRESETS`(로파이 05·01·20)이고 CHECK와 같은 목록입니다. 값을 바꾸면 contracts enum과 CHECK 마이그레이션을 같은 PR에 넣습니다.
- 사진 파일의 저장 위치는 정할 것입니다. DB에는 파일 키 목록(`photos jsonb`)만 둡니다.
- 공개된 안내를 고치는 동안의 내용은 별도 테이블 `guide_revisions`에 둡니다. 저장해도 `guides` 행(공개 내용·`updated_at`)은 바뀌지 않고, 수정 공개 트랜잭션에서만 수정본을 `guides`로 옮기고 지웁니다. 공개가 실패하면 공개된 내용·수정본·메모 상태는 그대로입니다([backend.md §7](backend.md#7-도메인-규칙)).
- 공개 건물 URL은 `buildings.id`(uuid v4)를 씁니다. 더 짧은 공개 키가 필요하면 정할 것입니다.
- `reporter_kind`는 제보 시점의 스냅숏입니다(`resident` 이 건물 거주자, `member` 로그인했지만 거주자가 아님, `guest` 로그인하지 않음). 집주인 화면의 ‘거주자’·‘회원’·‘비회원’ 표시에만 씁니다. 값 목록을 바꾼 CHECK는 `0006_report_kinds_optional_note`입니다.

## 5. 상태 전이는 어디서 지키나

전이 순서와 의미는 [screens.md §3](../lofi/screens.md#3-상태-전이)가 기준입니다. DB는 허용 값과 필수 짝만 막고, 순서와 조건은 서비스가 지킵니다.

| 대상 | 서비스 (`service.ts`) | DB 제약 |
|---|---|---|
| `buildings` preparing → open | 첫 안내 공개와 같은 트랜잭션. 되돌리지 않음 | CHECK 값 |
| `buildings` 확인 전 → 확인(`confirmed_at`) | `POST /manage/buildings/:buildingId/confirm`만. `coalesce(confirmed_at, now())`라 처음 시각을 남기고 다시 불러도 그대로. 되돌리는 요청은 없음(시연 초기화만 새봄하우스·준비빌라를 확인 전으로) | — |
| `guides` draft → published →(수정 공개) published | 공개 엔드포인트에서만. 수정 공개는 `guide_revisions` 행을 지우며(`DELETE … RETURNING`) 한 번만 가져가고 내용을 옮김 | CHECK 값, `published_at` 필수 짝, 수정본 안내마다 하나 |
| `manager_invites` issued → accepted·expired | 수락 시 만료 확인, 한 번만 수락 | CHECK 값, `token_hash` 유니크 |
| `occupancies` | 연결·건물 전환(기존 연결 종료와 새 연결이 한 트랜잭션), ‘아직 살아요’(→ active, `last_reconfirmed_at`·`next_reconfirm_at` 갱신), 이사(→ inactive, `ended_at`). 재확인 요청과 `reconfirm_needed`(`next_reconfirm_at` + 14일 무응답)는 읽을 때 계산하고 저장하지 않음 | CHECK 값, inactive면 `ended_at` 필수, 살아 있는 연결 하나 |
| `correction_memos` pending → applied·kept | applied는 안내 공개 트랜잭션 안에서만, kept는 사유와 함께 | CHECK 값, kept면 `kept_reason` 필수, pending이 아니면 `resolved_at` 필수 |
| `reports` received → acknowledged → completed·unable | `acknowledge`·`resolve` 요청으로만(조건부 UPDATE, 0건이면 409). 조회로 바뀌지 않음, 역방향 없음, 확인 전에는 결과를 남기지 못함 | CHECK 값, 확인·처리 시각 필수 짝 |
| `tips` 보임 ↔ 가림 | 운영자 스크립트(`db:moderate`)로만. 가림·복원과 그 팁의 신고 `open → reviewed`가 한 트랜잭션 | CHECK `hidden_reason`은 가렸을 때만 |
| `tips` 보임 → 지움 | 작성자 `DELETE`가 `deleted_at`만 채움(되돌리지 않음, 시드는 시드 팁을 되돌림). 가렸거나 검토 전 신고가 있으면 고치기(`PATCH`)는 조건부 UPDATE 0건 → 409 | — |
| `notices` published → expired | 만료 판단은 항상 `ends_at < now()` | CHECK `ends_at >= starts_at` |
| `notice_deliveries` 대상 → 시도 → 열람 | 행은 공지 게시 트랜잭션에서, `attempted_at`은 커밋 뒤 발송을 시도한 뒤 기록, `opened_at`은 대상이 처음 열 때 한 번(`opened_at is null`인 행만) | (notice, occupancy) 유니크 |

- 전이는 `UPDATE ... WHERE status = '<이전 상태>'`로 하고, 바뀐 행이 0이면 409 `CONFLICT`입니다([backend.md §7](backend.md#7-도메인-규칙)).
- `reconfirm_needed`는 주기 작업 없이 읽을 때 계산합니다(`status`에 쓰는 코드는 없고, CHECK 값은 나중의 일괄 작업·시드용으로 둠). 저장된 `reconfirm_needed`도 같은 뜻으로 읽습니다. `notices.status = 'expired'` 갱신을 요청 시점에 할지 주기 작업으로 할지는 정할 것입니다.

## 6. 마이그레이션

1. `schema.ts`를 고칩니다.
2. `db:generate`로 SQL을 만들고 `apps/api/drizzle/`의 생성 파일을 함께 커밋합니다. 생성된 SQL을 읽고 의도와 같은지 확인합니다.
3. `db:migrate`로 로컬 `wolgyeham`과 `wolgyeham_test`에 적용하고 테스트합니다.

- 이미 `main`에 들어간 마이그레이션 파일은 고치지 않고 새 마이그레이션을 추가합니다.
- 배포할 때 새 API가 시작되기 전에 마이그레이션이 자동으로 실행됩니다([deploy.md](deploy.md)).
- 데이터가 있는 컬럼을 지우거나 이름을 바꾸는 변경은 두 단계로 나눕니다: ① 새 컬럼 추가 + 코드가 새 컬럼을 쓰게 배포, ② 다음 PR에서 옛 컬럼 삭제. PR 본문에 영향과 단계를 적습니다.
- 상태 값을 추가하면 contracts enum, CHECK 마이그레이션, 서비스 전이를 같은 PR에서 고칩니다.
- 데이터 삭제·초기화는 영향을 팀에 공유한 뒤 사람이 실행합니다([CONTRIBUTING.md §9](../CONTRIBUTING.md#9-완료-기준)).

## 7. 환경별 DB

| 환경 | DB 이름 | 위치 |
|---|---|---|
| 로컬 개발 | `wolgyeham` | docker compose `db` 컨테이너 (`127.0.0.1:54329`) |
| 로컬 테스트 | `wolgyeham_test` | 같은 컨테이너. 서비스 테스트가 사용 |
| 배포 dev | `wolgyeham_dev` | EC2 호스트의 Postgres 컨테이너 하나 ([architecture.md](architecture.md)) |
| 배포 prod | `wolgyeham_prod` | 위와 같은 컨테이너 |

- 연결 문자열은 `DATABASE_URL` 하나로 받습니다. 로컬 값은 `apps/api/.env`, 배포 값은 SSM Parameter Store에 있습니다([deploy.md](deploy.md)).
- 테스트는 `TEST_DATABASE_URL`로 연결합니다. 없으면 로컬 `wolgyeham_test`(`postgres://wolgyeham:local-development-only@127.0.0.1:54329/wolgyeham_test`)를 씁니다. 테스트 파일마다 마이그레이션을 적용하고(advisory lock으로 한 번에 하나), 행을 지우지 않고 테스트마다 새 데이터를 만듭니다.
- 이미지 안의 `migrate.mjs`가 같은 폴더의 `drizzle/`을 읽습니다. 배포 때 deploy.sh가 새 API를 띄우기 전에 `node migrate.mjs`를 실행합니다.

## 8. 시드·시연 데이터

- `db:seed`는 로파이의 가상 건물 ‘햇살빌라’ 데이터를 만듭니다: 공개된 기본 안내, 공지, 시연 역할(입주자 A, 다음 입주자 B, 집주인, 옆 건물 주민)의 사용자와 관계. 실제 사람·실제 주소·실제 가입코드는 넣지 않습니다.
  - 지금 있는 것(구현 순서 A): 햇살빌라(open, id `5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01`)와 공개 안내 4개(분리수거·택배·보일러·설비·공용공간), 시드 시점 기준 진행 중인 공지 1개, 시연 집주인(`kakao_user_id` `demo-landlord`)과 관리 관계. 집주인 시작 시연용 새봄하우스(preparing, 관리자 없음, id `…4f02`)는 처음 한 번만 만들고 다시 시드해도 건드리지 않습니다.
  - 구현 순서 B: 햇살빌라의 시연 가입코드 `WK72P4`(로파이 LF-18·02에 그린 가상 코드), 입주자 A(`demo-resident-a`, 햇살빌라에 active로 연결)와 다음 입주자 B(`demo-resident-b`, 연결 없음 → 시연 가입코드로 연결). 다시 시드하면 시연 중 바꾼 햇살빌라 코드는 끝내고 `WK72P4`로 되돌리며, 입주자 A가 다른 건물로 옮겼으면 그 연결을 끝내고 햇살빌라 연결을 되살립니다. 시연 중 연결한 다른 사람(B 포함)의 햇살빌라 연결은 다시 시드해도 남고, `--reset-demo`로만 지워집니다.
  - 구현 순서 C·D: 햇살빌라 안내에 확인 전 수정 메모 2개(분리수거: 입주자 A가 씀, 택배: 작성자 연결 없음). 다시 시드하면 이 두 메모를 `pending`으로 되돌리고 시드 안내 4개의 수정본을 지웁니다. 시연 중 새로 남긴 메모는 남고 `--reset-demo`로만 지워집니다. 입주자 A는 시드한 시점에 확인을 마친 active(다음 요청은 `RECONFIRM_INTERVAL_DAYS` 뒤)이고, `--reconfirm-requested`를 붙이면 ‘재확인 요청됨’(하루 전 요청, 13일 뒤 reconfirm_needed)으로 만듭니다(시트 40 시연). 예: `pnpm --filter @wolgyeham/api db:seed -- --reconfirm-requested`, `… -- --reset-demo --reconfirm-requested`.
  - 구현 순서 F: 햇살빌라의 생활 팁 4개(로파이 04: 분리수거 팁은 입주자 A가 써서 A의 ‘내 팁’, 나머지 셋은 작성자 연결 없음, 작성 월 2026-09·2026-05·2025-12·2025-10). 다시 시드하면 이 네 팁을 시드 내용으로 되돌리고(가림 해제) 그 팁의 신고를 지웁니다. 시연 중 새로 남긴 팁·제보는 남고 `--reset-demo`로만 지워집니다.
  - 끝까지 해보는 테스트(e2e) 전용 건물 ‘테스트빌라’(open, id `5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f03`, 공개 안내 2개: 분리수거·택배)와 이 건물만 관리하는 e2e 집주인(`kakao_user_id` `demo-e2e-landlord`, 시연 로그인 가능). e2e가 안내를 만들고 공개해도 햇살빌라가 바뀌지 않게 하려는 건물입니다. 다시 시드하면 건물·시드 안내 2개를 되돌리고, e2e가 만든 안내는 `--reset-demo`로 지웁니다. 가입코드·거주자는 없습니다.
  - e2e의 새 집주인 흐름(초대 → 로그인 → 첫 공개) 전용 건물 ‘준비빌라’(preparing, id `5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f04`). 관리자·안내·가입코드가 없고, 새봄하우스처럼 처음 한 번만 만들어 다시 시드해도 건드리지 않습니다(관리자를 붙이지 않음). `--reset-demo`가 이 상태로 되돌립니다(e2e가 만든 관리자·초대·안내·가입코드를 지우고 preparing으로).
  - 건물 확인(LF-12·23): 햇살빌라·테스트빌라는 확인을 마친 상태(`confirmed_at` = 안내 수정 시각과 같은 고정 시각)로 시드하고 다시 시드해도 되돌립니다. 새봄하우스·준비빌라는 확인 전(null)으로 만들어 초대 → 로그인 → 건물 확인(23) → 안내 쓰기를 시연하고, 다시 시드해도 시연 중 확인한 것을 지우지 않으며 `--reset-demo`만 확인 전으로 되돌립니다.
  - 시연 계정의 약관 동의(`terms_*`)는 시드·초기화가 건드리지 않습니다(시연 로그인에 `consent`를 붙이면 남음).
  - 옆 건물 주민(29)은 비회원이라 계정이 없습니다. 시연 모드(`DEMO_MODE=true`)로 시드·초기화할 때만 햇살빌라에 비회원 제보 1건(확인 전)과 그 확인 링크 토큰(고정 원문, DB에는 해시만, 30일)을 만듭니다. 토큰 원문이 저장소에 공개돼 있어 `DEMO_MODE`가 꺼진 시드는 만들지 않고(이미 있으면 건드리지 않음), `--reset-demo`는 건물째 지우므로 이때 사라집니다.
  - 여러 번 실행해도 같은 상태가 됩니다. 햇살빌라의 시드 행(건물·안내 4개·공지)은 시드 내용으로 되돌리고, 그 밖의 행은 지우지 않습니다.
- 시연 사용자의 `kakao_user_id`는 실제 카카오 회원번호(숫자)와 겹치지 않는 값(예: `demo-landlord`)을 씁니다.
- 시드·초기화 함수는 `apps/api/src/db/demo.ts`에 있고, `seed.ts`는 인자를 읽는 CLI입니다. 서버 번들이 시연 모드 API(`POST /api/dev/reset`)로 `demo.ts`를 가져가도 CLI 코드(`import.meta.main`)가 섞이지 않게 나눴습니다.
- 시드는 로컬·dev·시연 환경에서만 실행합니다. `NODE_ENV=production`이면 `DEMO_MODE=true`가 아닐 때 실행을 거부합니다. prod에서는 실행하지 않습니다.
- 시연 초기화(LF-20)는 시연용 건물 데이터만 되돌립니다. `pnpm --filter @wolgyeham/api db:seed -- --reset-demo`(이미지에서는 `node seed.mjs --reset-demo`)는 고정 id의 시연 건물 네 곳(햇살빌라·새봄하우스·e2e 테스트빌라·e2e 준비빌라)만 한 트랜잭션에서 지우고(cascade: 안내·수정본·수정 메모·공지·관리자·초대·가입코드·시도 기록·연결·발송 기록·제보·조회 토큰·접수 기록·팁·신고) 처음 시드한 상태로 다시 만든 뒤, 건물마다 지운 행 수(제보·팁 포함)를 출력합니다. 시드와 초기화는 advisory lock으로 한 번에 하나씩 돕니다. 새봄하우스는 다시 preparing·안내 없음·관리자 없음이 됩니다. 테스트빌라는 시드 안내 2개만 남고 e2e 집주인이 다시 관리자가 됩니다. 다른 건물과 사용자(시연 집주인 포함)는 지우지 않습니다. production 거부 규칙은 시드와 같습니다. 시연 모드(`DEMO_MODE=true`)에서는 같은 함수를 `POST /api/dev/reset`(29 ‘처음 상태로 되돌리기’)이 범위 `demo`로 불러 발표 시연 건물 두 곳(햇살빌라·새봄하우스)만 되돌립니다(e2e 건물·e2e 집주인은 그대로). 같은 사람(IP) 30초에 한 번·한 시간에 10번, 모든 사람을 합쳐 30초에 한 번·한 시간에 20번으로 제한합니다([backend.md §6](backend.md#6-권한)).

## 9. 백업과 보관

- dev·prod는 매일 `pg_dump`로 S3에 백업하고 14일 보관합니다. 방법과 위치는 [deploy.md](deploy.md)와 [architecture.md](architecture.md)를 따릅니다.
- 본선 전에 백업을 복구해 보는 연습을 한 번 합니다(절차는 deploy.md).
- 제보 보관 기간은 정할 것입니다([README.md §12 POL-010](../README.md#12-정책)). 조회 토큰은 30일 뒤 쓸 수 없고(410), 만료된 지 30일이 더 지나면 제보를 받을 때마다 조금씩 지웁니다(그 뒤 404). 기간이 지난 제보를 지우는 작업은 아직 구현 전입니다. 반복 접수 제한 기록(`report_submissions`)은 하루 뒤, `rate_limits`·`join_code_attempts`는 하루 넘게 쓰이지 않으면 지웁니다. DB에서 지운 데이터도 백업 파일에는 최대 14일 남습니다.

## 10. 개인정보

| 항목 | 규칙 |
|---|---|
| 계정 | 카카오 회원번호만 저장합니다. 닉네임·프로필 사진은 필요해질 때 목적을 정하고 decisions.md에 남긴 뒤 추가합니다. 실명·전화번호는 받지 않습니다 |
| 해시 저장 | 세션, 집주인 초대, 제보 조회 토큰은 SHA-256 해시만 저장합니다. 반복 제한의 제보 문구도 해시(`report_submissions.content_hash`)만 둡니다 |
| 원문 저장 예외 | `join_codes.code`는 집주인이 다시 봐야 해서, 푸시 구독의 `p256dh`·`auth`는 알림을 암호화해 보내야 해서 원문으로 둡니다. 로그와 응답에는 필요한 곳 외에 내보내지 않습니다. 가입코드는 그 건물 관리자에게만 응답합니다 |
| IP | `join_code_attempts.client_key`·`report_submissions.client_key`에 IP 묶음(IPv6는 /64)을 `SESSION_SECRET`에서 HKDF로 따로 만든 키(`wolgyeham/ip-key/v1`)로 HMAC-SHA256한 값만 둡니다. DB 값만으로는 되돌리기 어렵지만 키를 가진 서버는 대조할 수 있는 가명 처리이므로, 가입코드 행은 맞히면 지우고 하루 넘게 쓰이지 않으면 지우며, 제보 접수 기록도 하루 뒤 지웁니다. 로그에는 IP를 남기지 않습니다 |
| 작성자 | 팁·메모·제보의 작성자는 내부에만 저장합니다. 어떤 응답에도 작성자 ID를 넣지 않습니다. 수정 메모·팁은 집주인에게도 작성자를 보내지 않고, 거주자에게는 본인이 쓴 것인지(`mine`)만 알립니다. 팁 날짜는 작성 월만 보냅니다. 제보는 집주인에게 거주자·회원·비회원 구분(`reporter_kind`)만 보냅니다 |
| 주소 | 공개 응답에는 `display_address`만 씁니다. `full_address`는 팀과 집주인만 봅니다 |
| 계정 삭제 | `users` 행을 지우면 세션·푸시 구독·연결·관리자 관계는 cascade로 지워지고, 팁·메모·제보의 작성자 연결은 `set null`로 끊깁니다. 삭제 화면과 절차는 정할 것입니다 |

## 바꿀 때

- 스키마와 이 문서는 PR로 바꿉니다. 테이블 구성, 명명 규칙, 보관 기간처럼 결정이 바뀌면 [decisions.md](decisions.md)에 기록합니다.
- 순서는 계약(`packages/contracts`의 enum·글자 수) → 스키마·마이그레이션 → API → 웹입니다. 계약을 깨는 변경은 양쪽을 같은 PR에서 고칩니다.
- 데이터 귀속과 상태 전이가 [lofi/screens.md](../lofi/screens.md)와 다르면 screens.md를 먼저 고칩니다.
