DROP INDEX "notification_user_org_created_idx";--> statement-breakpoint
CREATE INDEX "notification_inbox_idx" ON "notification" USING btree ("user_id","organization_id","id");