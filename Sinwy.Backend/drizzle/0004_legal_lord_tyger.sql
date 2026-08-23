CREATE TABLE "organization_profile" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"tagline" text,
	"description" text,
	"email" text,
	"phone" text,
	"website" text,
	"city" text,
	"country" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "onboarding_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "organization_profile" ADD CONSTRAINT "organization_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;