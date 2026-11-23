ALTER TABLE "page_content" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "page_content" SET "updated_at" = "created_at";
