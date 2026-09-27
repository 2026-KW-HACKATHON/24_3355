import {
  BUILDING_STATUSES,
  GUIDE_BODY_MAX,
  GUIDE_CATEGORIES,
  GUIDE_STATUSES,
  GUIDE_TITLE_MAX,
  NOTICE_STATUSES,
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
    ...timestamps,
  },
  (t) => [uniqueIndex("users_kakao_user_id_key").on(t.kakaoUserId)],
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
    index("notices_building_id_ends_at_idx").on(t.buildingId, t.endsAt),
  ],
);
