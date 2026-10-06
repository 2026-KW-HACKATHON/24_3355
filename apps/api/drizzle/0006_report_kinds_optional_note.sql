ALTER TABLE "reports" DROP CONSTRAINT "reports_result_note_check";--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_reporter_kind_check";--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_kind_check" CHECK ("reports"."reporter_kind" in ('guest', 'member', 'resident'));