import {
  BUILDING_STATUSES,
  CONTENT_REPORT_REASON_MAX,
  CORRECTION_MEMO_BODY_MAX,
  CORRECTION_MEMO_REASON_MAX,
  CORRECTION_MEMO_STATUSES,
  GUIDE_BODY_MAX,
  GUIDE_CATEGORIES,
  GUIDE_STATUSES,
  GUIDE_TITLE_MAX,
  NOTICE_BODY_MAX,
  NOTICE_STATUSES,
  NOTICE_TITLE_MAX,
  OCCUPANCY_STATUSES,
  REPORT_BODY_MAX,
  REPORT_KINDS,
  REPORT_LOCATIONS,
  REPORT_PRESETS,
  REPORT_RESULT_NOTE_MAX,
  REPORT_STATUSES,
  REPORTER_KINDS,
  TIP_BODY_MAX,
  TIP_CATEGORIES,
} from "@wolgyeham/contracts";
import { type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const INVITE_STATUSES = ["issued", "accepted", "expired"] as const;
/** 콘텐츠 신고 상태. 운영자가 가리거나 복원하면 그 팁의 `open` 신고가 `reviewed`가 됩니다(LF-19). */
const CONTENT_REPORT_STATUSES = ["open", "reviewed"] as const;
/** 운영자 판단 기록의 동작. */
const MODERATION_ACTIONS = ["hide", "restore"] as const;
/** 운영자 이름(`--by`) 글자 수. */
const MODERATOR_NAME_MAX = 100;

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** contracts의 enum 목록으로 CHECK를 만듭니다. 값은 코드 상수라 raw로 넣어도 안전합니다. */
function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;
}

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kakaoUserId: text("kakao_user_id").notNull(),
    /** 동의한 약관·개인정보 처리방침 판(contracts `TERMS_VERSION`, D-28)과 그 시각. 동의 기록이 없으면 둘 다 null. */
    termsVersion: text("terms_version"),
    termsAgreedAt: timestamp("terms_agreed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_kakao_user_id_key").on(t.kakaoUserId),
    check(
      "users_terms_check",
      sql`(${t.termsVersion} is null) = (${t.termsAgreedAt} is null) and char_length(${t.termsVersion}) <= 64`,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sessions_token_hash_key").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
  ],
);

export const buildings = pgTable(
  "buildings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    displayAddress: text("display_address").notNull(),
    fullAddress: text("full_address").notNull(),
    status: text("status", { enum: BUILDING_STATUSES }).notNull().default("preparing"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    /** 집주인이 건물 확인(LF-12·23)을 처음 마친 시각. null이면 초대 수락 뒤 아직 확인 전입니다. */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("buildings_status_check", oneOf(t.status, BUILDING_STATUSES)),
    check("buildings_opened_at_check", sql`${t.status} = 'preparing' or ${t.openedAt} is not null`),
  ],
);

export const managerInvites = pgTable(
  "manager_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    status: text("status", { enum: INVITE_STATUSES }).notNull().default("issued"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("manager_invites_token_hash_key").on(t.tokenHash),
    index("manager_invites_accepted_by_user_id_idx").on(t.acceptedByUserId),
    check("manager_invites_status_check", oneOf(t.status, INVITE_STATUSES)),
  ],
);

export const buildingManagers = pgTable(
  "building_managers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteId: uuid("invite_id").references(() => managerInvites.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("building_managers_building_id_user_id_key").on(t.buildingId, t.userId),
    index("building_managers_user_id_idx").on(t.userId),
  ],
);

export const guides = pgTable(
  "guides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    category: text("category", { enum: GUIDE_CATEGORIES }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** 사진 파일 키 목록. 저장 위치는 정할 것. */
    photos: jsonb("photos").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    position: integer("position").notNull().default(0),
    status: text("status", { enum: GUIDE_STATUSES }).notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    check("guides_category_check", oneOf(t.category, GUIDE_CATEGORIES)),
    check("guides_status_check", oneOf(t.status, GUIDE_STATUSES)),
    check("guides_published_at_check", sql`${t.status} = 'draft' or ${t.publishedAt} is not null`),
    check(
      "guides_title_length_check",
      sql`char_length(${t.title}) <= ${sql.raw(String(GUIDE_TITLE_MAX))}`,
    ),
    check(
      "guides_body_length_check",
      sql`char_length(${t.body}) <= ${sql.raw(String(GUIDE_BODY_MAX))}`,
    ),
    index("guides_building_id_status_idx").on(t.buildingId, t.status),
    index("guides_author_user_id_idx").on(t.authorUserId),
  ],
);

/**
 * 공개된 안내의 아직 공개하지 않은 수정본. 안내마다 하나입니다. 공개 내용(`guides`)은 수정 공개 트랜잭션에서만
 * 이 행의 값으로 바뀌고, 그때 이 행을 지웁니다. 편집을 취소하면 이 행만 지웁니다.
 */
export const guideRevisions = pgTable(
  "guide_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    category: text("category", { enum: GUIDE_CATEGORIES }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("guide_revisions_guide_id_key").on(t.guideId),
    index("guide_revisions_author_user_id_idx").on(t.authorUserId),
    check("guide_revisions_category_check", oneOf(t.category, GUIDE_CATEGORIES)),
    check(
      "guide_revisions_title_length_check",
      sql`char_length(${t.title}) <= ${sql.raw(String(GUIDE_TITLE_MAX))}`,
    ),
    check(
      "guide_revisions_body_length_check",
      sql`char_length(${t.body}) <= ${sql.raw(String(GUIDE_BODY_MAX))}`,
    ),
  ],
);

/**
 * 수정 메모. 작성자는 내부에만 저장하고 응답에 넣지 않습니다(database.md §10).
 * `applied`는 안내 공개 트랜잭션에서만, `kept`는 사유와 함께 바뀝니다.
 */
export const correctionMemos = pgTable(
  "correction_memos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    status: text("status", { enum: CORRECTION_MEMO_STATUSES }).notNull().default("pending"),
    keptReason: text("kept_reason"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("correction_memos_status_check", oneOf(t.status, CORRECTION_MEMO_STATUSES)),
    check(
      "correction_memos_body_length_check",
      sql`char_length(${t.body}) <= ${sql.raw(String(CORRECTION_MEMO_BODY_MAX))}`,
    ),
    check(
      "correction_memos_kept_reason_check",
      sql`${t.status} <> 'kept' or ${t.keptReason} is not null`,
    ),
    check(
      "correction_memos_kept_reason_length_check",
      sql`char_length(${t.keptReason}) <= ${sql.raw(String(CORRECTION_MEMO_REASON_MAX))}`,
    ),
    check(
      "correction_memos_resolved_at_check",
      sql`(${t.status} = 'pending') = (${t.resolvedAt} is null)`,
    ),
    index("correction_memos_guide_id_status_idx").on(t.guideId, t.status),
    index("correction_memos_author_user_id_idx").on(t.authorUserId),
  ],
);

export const notices = pgTable(
  "notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: NOTICE_STATUSES }).notNull().default("published"),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    check("notices_status_check", oneOf(t.status, NOTICE_STATUSES)),
    check("notices_period_check", sql`${t.endsAt} >= ${t.startsAt}`),
    check(
      "notices_title_length_check",
      sql`char_length(${t.title}) <= ${sql.raw(String(NOTICE_TITLE_MAX))}`,
    ),
    check(
      "notices_body_length_check",
      sql`char_length(${t.body}) <= ${sql.raw(String(NOTICE_BODY_MAX))}`,
    ),
    index("notices_building_id_ends_at_idx").on(t.buildingId, t.endsAt),
    index("notices_author_user_id_idx").on(t.authorUserId),
  ],
);

/**
 * 가입코드. 집주인이 다시 봐야 해서 원문으로 둡니다(database.md §10).
 * 현재 코드는 `retired_at is null`인 행 하나이고, 바꾸면 이전 행에 `retired_at`을 채웁니다.
 */
export const joinCodes = pgTable(
  "join_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("join_codes_code_check", sql`${t.code} ~ '^[A-Z0-9]{6}$'`),
    uniqueIndex("join_codes_building_id_current_key")
      .on(t.buildingId)
      .where(sql`${t.retiredAt} is null`),
    index("join_codes_created_by_user_id_idx").on(t.createdByUserId),
  ],
);

/**
 * 가입코드 실패 횟수. (건물, 클라이언트 키)마다 한 행이고, 맞히면 지웁니다.
 * `client_key`는 `ip:<SHA-256>` 또는 `user:<uuid>`입니다(backend.md §7).
 */
export const joinCodeAttempts = pgTable(
  "join_code_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    clientKey: text("client_key").notNull(),
    failedCount: integer("failed_count").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("join_code_attempts_building_id_client_key_key").on(t.buildingId, t.clientKey),
    index("join_code_attempts_updated_at_idx").on(t.updatedAt),
  ],
);

export const occupancies = pgTable(
  "occupancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: OCCUPANCY_STATUSES }).notNull().default("active"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    lastReconfirmedAt: timestamp("last_reconfirmed_at", { withTimezone: true }),
    nextReconfirmAt: timestamp("next_reconfirm_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("occupancies_status_check", oneOf(t.status, OCCUPANCY_STATUSES)),
    check("occupancies_ended_at_check", sql`${t.status} <> 'inactive' or ${t.endedAt} is not null`),
    uniqueIndex("occupancies_user_id_live_key").on(t.userId).where(sql`${t.status} <> 'inactive'`),
    index("occupancies_building_id_status_idx").on(t.buildingId, t.status),
  ],
);

/**
 * 브라우저(기기)마다 한 행. `p256dh`·`auth`는 알림 암호화에 필요해서 원문으로 둡니다. 사용자마다 최근 5개만
 * 두고, 404·410이 아닌 실패가 3번 이어지면(`failure_count`) 지웁니다.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    failureCount: integer("failure_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_key").on(t.endpoint),
    index("push_subscriptions_user_id_idx").on(t.userId),
  ],
);

/** 행 하나가 알림 대상 한 명입니다. 대상 → 시도(`attempted_at`) → 열람(`opened_at`)을 따로 기록합니다. */
export const noticeDeliveries = pgTable(
  "notice_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noticeId: uuid("notice_id")
      .notNull()
      .references(() => notices.id, { onDelete: "cascade" }),
    occupancyId: uuid("occupancy_id")
      .notNull()
      .references(() => occupancies.id, { onDelete: "cascade" }),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("notice_deliveries_notice_id_occupancy_id_key").on(t.noticeId, t.occupancyId),
    index("notice_deliveries_occupancy_id_idx").on(t.occupancyId),
  ],
);

/**
 * 집주인에게 알리기(제보). 보낸 계정은 `reporter_user_id`에만 두고 집주인에게는 `reporter_kind`(보낸 시점의
 * 거주자·회원·비회원 구분)만 보냅니다. 상태는 received → acknowledged → completed | unable이고 버튼 요청으로만 바뀝니다.
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, { onDelete: "set null" }),
    reporterKind: text("reporter_kind", { enum: REPORTER_KINDS }).notNull(),
    /** 자주 쓰는 말로 보냈으면 그 키. 직접 적었으면 null. */
    preset: text("preset", { enum: REPORT_PRESETS }),
    kind: text("kind", { enum: REPORT_KINDS }).notNull(),
    location: text("location", { enum: REPORT_LOCATIONS }),
    /** 직접 적은 내용 또는 자주 쓰는 말에 덧붙인 내용. */
    body: text("body"),
    status: text("status", { enum: REPORT_STATUSES }).notNull().default("received"),
    resultNote: text("result_note"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("reports_reporter_kind_check", oneOf(t.reporterKind, REPORTER_KINDS)),
    check("reports_preset_check", oneOf(t.preset, REPORT_PRESETS)),
    check("reports_kind_check", oneOf(t.kind, REPORT_KINDS)),
    check("reports_location_check", oneOf(t.location, REPORT_LOCATIONS)),
    check("reports_status_check", oneOf(t.status, REPORT_STATUSES)),
    check("reports_content_check", sql`${t.preset} is not null or ${t.body} is not null`),
    check(
      "reports_body_length_check",
      sql`char_length(${t.body}) <= ${sql.raw(String(REPORT_BODY_MAX))}`,
    ),
    check(
      "reports_result_note_length_check",
      sql`char_length(${t.resultNote}) <= ${sql.raw(String(REPORT_RESULT_NOTE_MAX))}`,
    ),
    check(
      "reports_acknowledged_at_check",
      sql`${t.status} = 'received' or ${t.acknowledgedAt} is not null`,
    ),
    check(
      "reports_resolved_at_check",
      sql`(${t.status} in ('completed', 'unable')) = (${t.resolvedAt} is not null)`,
    ),
    index("reports_building_id_status_idx").on(t.buildingId, t.status),
    index("reports_reporter_user_id_idx").on(t.reporterUserId),
  ],
);

/** 비회원 확인 링크. 토큰 원문은 만든 응답에서 한 번만 보내고 SHA-256 해시만 저장합니다(발급 후 30일). */
export const reportAccessTokens = pgTable(
  "report_access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("report_access_tokens_token_hash_key").on(t.tokenHash),
    index("report_access_tokens_report_id_idx").on(t.reportId),
    index("report_access_tokens_expires_at_idx").on(t.expiresAt),
  ],
);

/**
 * 반복 접수 제한용 접수 기록. 제보 한 건마다 한 행이고, `client_key`는 `user:<uuid>` 또는 `ip:<SHA-256>`,
 * `content_hash`는 정규화한 문구의 SHA-256입니다. 하루가 지난 행은 같은 건물의 다음 접수 때 지웁니다.
 */
export const reportSubmissions = pgTable(
  "report_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    clientKey: text("client_key").notNull(),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (t) => [
    index("report_submissions_building_id_client_key_created_at_idx").on(
      t.buildingId,
      t.clientKey,
      t.createdAt,
    ),
    index("report_submissions_created_at_idx").on(t.createdAt),
  ],
);

/**
 * 생활 팁. 작성자는 `author_user_id`에만 두고 응답에는 본인 글인지(`mine`)만 보냅니다. 운영팀이 가리면
 * `hidden_at`이 채워져 목록에서 빠지고, 복원하면 비웁니다(LF-19). 작성자가 지우면 `deleted_at`만 채워
 * (신고·운영 기록이 남도록) 목록에서 뺍니다.
 */
export const tips = pgTable(
  "tips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    category: text("category", { enum: TIP_CATEGORIES }).notNull(),
    body: text("body").notNull(),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenReason: text("hidden_reason"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("tips_category_check", oneOf(t.category, TIP_CATEGORIES)),
    check(
      "tips_body_length_check",
      sql`char_length(${t.body}) <= ${sql.raw(String(TIP_BODY_MAX))}`,
    ),
    check("tips_hidden_reason_check", sql`${t.hiddenReason} is null or ${t.hiddenAt} is not null`),
    check(
      "tips_hidden_reason_length_check",
      sql`char_length(${t.hiddenReason}) <= ${sql.raw(String(CONTENT_REPORT_REASON_MAX))}`,
    ),
    index("tips_building_id_idx").on(t.buildingId),
    index("tips_author_user_id_idx").on(t.authorUserId),
  ],
);

/**
 * 팁 신고. 한 사람이 한 팁에 한 번만 합니다. 신고할 때의 팁 내용을 `tip_body`에 남겨 작성자가 나중에 고치거나
 * 지워도 운영자가 신고된 내용을 봅니다. 운영자가 판단하면(가림·복원) `reviewed`가 됩니다.
 */
export const contentReports = pgTable(
  "content_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipId: uuid("tip_id")
      .notNull()
      .references(() => tips.id, { onDelete: "cascade" }),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    tipBody: text("tip_body"),
    status: text("status", { enum: CONTENT_REPORT_STATUSES }).notNull().default("open"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("content_reports_tip_id_reporter_user_id_key").on(t.tipId, t.reporterUserId),
    check("content_reports_status_check", oneOf(t.status, CONTENT_REPORT_STATUSES)),
    check(
      "content_reports_reason_length_check",
      sql`char_length(${t.reason}) <= ${sql.raw(String(CONTENT_REPORT_REASON_MAX))}`,
    ),
    check(
      "content_reports_reviewed_at_check",
      sql`(${t.status} = 'open') = (${t.reviewedAt} is null)`,
    ),
    index("content_reports_status_idx").on(t.status),
    index("content_reports_reporter_user_id_idx").on(t.reporterUserId),
  ],
);

/**
 * 운영자 판단 기록(LF-19). 가림·복원할 때마다 한 행을 같은 트랜잭션에서 남기고 지우지 않습니다.
 * `operator`는 `db:moderate --by`로 받은 운영자 이름입니다.
 */
export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipId: uuid("tip_id")
      .notNull()
      .references(() => tips.id, { onDelete: "cascade" }),
    action: text("action", { enum: MODERATION_ACTIONS }).notNull(),
    reason: text("reason"),
    operator: text("operator").notNull(),
    ...timestamps,
  },
  (t) => [
    check("moderation_actions_action_check", oneOf(t.action, MODERATION_ACTIONS)),
    check(
      "moderation_actions_reason_length_check",
      sql`char_length(${t.reason}) <= ${sql.raw(String(CONTENT_REPORT_REASON_MAX))}`,
    ),
    check(
      "moderation_actions_operator_length_check",
      sql`char_length(${t.operator}) between 1 and ${sql.raw(String(MODERATOR_NAME_MAX))}`,
    ),
    index("moderation_actions_tip_id_idx").on(t.tipId),
  ],
);

/**
 * 고정 창 횟수 제한(`lib/rate-limit.ts`). (종류, 키)마다 한 행이고 창이 지나면 1부터 다시 셉니다.
 * 하루 넘게 쓰이지 않은 행은 다음 요청 때 조금씩 지웁니다.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bucket: text("bucket").notNull(),
    subjectKey: text("subject_key").notNull(),
    hitCount: integer("hit_count").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("rate_limits_bucket_subject_key_key").on(t.bucket, t.subjectKey),
    index("rate_limits_updated_at_idx").on(t.updatedAt),
  ],
);
