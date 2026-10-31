ALTER TABLE "organization" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "currency" text DEFAULT 'EUR' NOT NULL;