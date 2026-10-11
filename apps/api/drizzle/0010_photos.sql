ALTER TABLE "guide_revisions" ADD COLUMN "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_revisions" ADD CONSTRAINT "guide_revisions_photos_check" CHECK (jsonb_typeof("guide_revisions"."photos") = 'array' and jsonb_array_length("guide_revisions"."photos") <= 4);--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_photos_check" CHECK (jsonb_typeof("guides"."photos") = 'array' and jsonb_array_length("guides"."photos") <= 4);--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_photos_check" CHECK (jsonb_typeof("notices"."photos") = 'array' and jsonb_array_length("notices"."photos") <= 4);