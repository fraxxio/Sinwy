ALTER TABLE "user_subscription" ADD COLUMN "downgrade_plan" text;--> statement-breakpoint
ALTER TABLE "user_subscription" ADD COLUMN "downgrade_releases" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subscription" ADD CONSTRAINT "user_subscription_downgrade_plan_check" CHECK ("downgrade_plan" IN ('starter', 'professional', 'enterprise'));