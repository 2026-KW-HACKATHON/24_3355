CREATE TABLE "content_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tip_id" uuid NOT NULL,
	"reporter_user_id" uuid,
	"reason" text,
	"status" text DEFAULT 'open' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_reports_status_check" CHECK ("content_reports"."status" in ('open', 'reviewed')),
	CONSTRAINT "content_reports_reason_length_check" CHECK (char_length("content_reports"."reason") <= 200),
	CONSTRAINT "content_reports_reviewed_at_check" CHECK (("content_reports"."status" = 'open') = ("content_reports"."reviewed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"author_user_id" uuid,
	"category" text NOT NULL,
	"body" text NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tips_category_check" CHECK ("tips"."category" in ('recycling', 'parcel', 'winter', 'common', 'other')),
	CONSTRAINT "tips_body_length_check" CHECK (char_length("tips"."body") <= 200),
	CONSTRAINT "tips_hidden_reason_check" CHECK ("tips"."hidden_reason" is null or "tips"."hidden_at" is not null),
	CONSTRAINT "tips_hidden_reason_length_check" CHECK (char_length("tips"."hidden_reason") <= 200)
);
--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_tip_id_tips_id_fk" FOREIGN KEY ("tip_id") REFERENCES "public"."tips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_reports_tip_id_reporter_user_id_key" ON "content_reports" USING btree ("tip_id","reporter_user_id");--> statement-breakpoint
CREATE INDEX "content_reports_status_idx" ON "content_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tips_building_id_idx" ON "tips" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "tips_author_user_id_idx" ON "tips" USING btree ("author_user_id");