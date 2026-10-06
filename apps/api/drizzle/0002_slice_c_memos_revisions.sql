CREATE TABLE "correction_memos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guide_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"kept_reason" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "correction_memos_status_check" CHECK ("correction_memos"."status" in ('pending', 'applied', 'kept')),
	CONSTRAINT "correction_memos_body_length_check" CHECK (char_length("correction_memos"."body") <= 200),
	CONSTRAINT "correction_memos_kept_reason_check" CHECK ("correction_memos"."status" <> 'kept' or "correction_memos"."kept_reason" is not null),
	CONSTRAINT "correction_memos_kept_reason_length_check" CHECK (char_length("correction_memos"."kept_reason") <= 200),
	CONSTRAINT "correction_memos_resolved_at_check" CHECK (("correction_memos"."status" = 'pending') = ("correction_memos"."resolved_at" is null))
);
--> statement-breakpoint
CREATE TABLE "guide_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guide_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_revisions_category_check" CHECK ("guide_revisions"."category" in ('recycling', 'parcel', 'facility', 'common', 'contact')),
	CONSTRAINT "guide_revisions_title_length_check" CHECK (char_length("guide_revisions"."title") <= 80),
	CONSTRAINT "guide_revisions_body_length_check" CHECK (char_length("guide_revisions"."body") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "correction_memos" ADD CONSTRAINT "correction_memos_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_memos" ADD CONSTRAINT "correction_memos_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD CONSTRAINT "guide_revisions_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD CONSTRAINT "guide_revisions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "correction_memos_guide_id_status_idx" ON "correction_memos" USING btree ("guide_id","status");--> statement-breakpoint
CREATE INDEX "correction_memos_author_user_id_idx" ON "correction_memos" USING btree ("author_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guide_revisions_guide_id_key" ON "guide_revisions" USING btree ("guide_id");