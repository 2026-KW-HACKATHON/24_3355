CREATE TABLE "content_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guide_id" uuid,
	"notice_id" uuid,
	"lang" text NOT NULL,
	"source_hash" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_translations_lang_check" CHECK ("content_translations"."lang" in ('en', 'zh-CN', 'vi')),
	CONSTRAINT "content_translations_source_check" CHECK (num_nonnulls("content_translations"."guide_id", "content_translations"."notice_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "content_translations" ADD CONSTRAINT "content_translations_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_translations" ADD CONSTRAINT "content_translations_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_translations_guide_id_lang_key" ON "content_translations" USING btree ("guide_id","lang");--> statement-breakpoint
CREATE UNIQUE INDEX "content_translations_notice_id_lang_key" ON "content_translations" USING btree ("notice_id","lang");