CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tip_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"operator" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_actions_action_check" CHECK ("moderation_actions"."action" in ('hide', 'restore')),
	CONSTRAINT "moderation_actions_reason_length_check" CHECK (char_length("moderation_actions"."reason") <= 200),
	CONSTRAINT "moderation_actions_operator_length_check" CHECK (char_length("moderation_actions"."operator") between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"subject_key" text NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_reports" ADD COLUMN "tip_body" text;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_tip_id_tips_id_fk" FOREIGN KEY ("tip_id") REFERENCES "public"."tips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_actions_tip_id_idx" ON "moderation_actions" USING btree ("tip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_bucket_subject_key_key" ON "rate_limits" USING btree ("bucket","subject_key");--> statement-breakpoint
CREATE INDEX "rate_limits_updated_at_idx" ON "rate_limits" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "join_code_attempts_updated_at_idx" ON "join_code_attempts" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "report_access_tokens_expires_at_idx" ON "report_access_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "report_submissions_created_at_idx" ON "report_submissions" USING btree ("created_at");