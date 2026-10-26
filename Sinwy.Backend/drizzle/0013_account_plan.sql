CREATE TABLE "user_subscription" (
	"user_id" text PRIMARY KEY NOT NULL,
	"subscription_id" text,
	"plan" text,
	"status" text NOT NULL,
	"subscription_status_at" timestamp NOT NULL,
	"trial_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_subscription_subscription_id_unique" UNIQUE("subscription_id"),
	CONSTRAINT "user_subscription_plan_check" CHECK ("plan" IN ('starter', 'professional', 'enterprise')),
	CONSTRAINT "user_subscription_plan_only_when_entitled_check" CHECK ("user_subscription"."plan" IS NULL OR "status" IN ('active', 'trialing', 'past_due'))
);
--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_subscription_id_unique";--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_status_check";--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_plan_check";--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_plan_only_when_active_check";--> statement-breakpoint
ALTER TABLE "user_subscription" ADD CONSTRAINT "user_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "plan";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "subscription_id";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "subscription_status_at";