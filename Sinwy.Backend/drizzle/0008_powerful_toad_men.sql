ALTER TABLE "organization" ADD COLUMN "plan" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "subscription_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_subscription_id_unique" UNIQUE("subscription_id");