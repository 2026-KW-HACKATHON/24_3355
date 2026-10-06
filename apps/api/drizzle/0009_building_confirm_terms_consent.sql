ALTER TABLE "buildings" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_agreed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_terms_check" CHECK (("users"."terms_version" is null) = ("users"."terms_agreed_at" is null) and char_length("users"."terms_version") <= 64);--> statement-breakpoint
-- 건물 확인(LF-12·23)이 생기기 전에 초대를 수락한 건물은 이미 확인한 것으로 봅니다(첫 관리자가 생긴 시각).
UPDATE "buildings" SET "confirmed_at" = "first_manager"."created_at"
FROM (
  SELECT "building_id", min("created_at") AS "created_at" FROM "building_managers" GROUP BY "building_id"
) AS "first_manager"
WHERE "first_manager"."building_id" = "buildings"."id" AND "buildings"."confirmed_at" IS NULL;
