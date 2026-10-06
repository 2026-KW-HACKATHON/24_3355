CREATE TABLE "report_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"client_key" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"reporter_user_id" uuid,
	"reporter_kind" text NOT NULL,
	"preset" text,
	"kind" text NOT NULL,
	"location" text,
	"body" text,
	"status" text DEFAULT 'received' NOT NULL,
	"result_note" text,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_reporter_kind_check" CHECK ("reports"."reporter_kind" in ('guest', 'resident')),
	CONSTRAINT "reports_preset_check" CHECK ("reports"."preset" in ('trash_overflow', 'passage_blocked', 'leak_or_broken')),
	CONSTRAINT "reports_kind_check" CHECK ("reports"."kind" in ('trash', 'passage', 'noise', 'facility', 'other')),
	CONSTRAINT "reports_location_check" CHECK ("reports"."location" in ('alley', 'recycling_area', 'stairs_hallway', 'parking')),
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('received', 'acknowledged', 'completed', 'unable')),
	CONSTRAINT "reports_content_check" CHECK ("reports"."preset" is not null or "reports"."body" is not null),
	CONSTRAINT "reports_body_length_check" CHECK (char_length("reports"."body") <= 300),
	CONSTRAINT "reports_result_note_length_check" CHECK (char_length("reports"."result_note") <= 100),
	CONSTRAINT "reports_acknowledged_at_check" CHECK ("reports"."status" = 'received' or "reports"."acknowledged_at" is not null),
	CONSTRAINT "reports_resolved_at_check" CHECK (("reports"."status" in ('completed', 'unable')) = ("reports"."resolved_at" is not null)),
	CONSTRAINT "reports_result_note_check" CHECK ("reports"."status" <> 'unable' or "reports"."result_note" is not null)
);
--> statement-breakpoint
ALTER TABLE "report_access_tokens" ADD CONSTRAINT "report_access_tokens_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_submissions" ADD CONSTRAINT "report_submissions_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_access_tokens_token_hash_key" ON "report_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "report_access_tokens_report_id_idx" ON "report_access_tokens" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_submissions_building_id_client_key_created_at_idx" ON "report_submissions" USING btree ("building_id","client_key","created_at");--> statement-breakpoint
CREATE INDEX "reports_building_id_status_idx" ON "reports" USING btree ("building_id","status");--> statement-breakpoint
CREATE INDEX "reports_reporter_user_id_idx" ON "reports" USING btree ("reporter_user_id");