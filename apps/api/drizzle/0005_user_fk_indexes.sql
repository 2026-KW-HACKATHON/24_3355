CREATE INDEX "content_reports_reporter_user_id_idx" ON "content_reports" USING btree ("reporter_user_id");--> statement-breakpoint
CREATE INDEX "guide_revisions_author_user_id_idx" ON "guide_revisions" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "guides_author_user_id_idx" ON "guides" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "join_codes_created_by_user_id_idx" ON "join_codes" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "manager_invites_accepted_by_user_id_idx" ON "manager_invites" USING btree ("accepted_by_user_id");--> statement-breakpoint
CREATE INDEX "notices_author_user_id_idx" ON "notices" USING btree ("author_user_id");