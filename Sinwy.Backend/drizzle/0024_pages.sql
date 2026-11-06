CREATE TABLE "page" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"published_version_id" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "page_status_check" CHECK ("status" IN ('draft', 'published'))
);
--> statement-breakpoint
CREATE TABLE "page_content" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "page_content_version_check" CHECK ("page_content"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "page" ADD CONSTRAINT "page_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page" ADD CONSTRAINT "page_published_version_id_page_content_id_fk" FOREIGN KEY ("published_version_id") REFERENCES "public"."page_content"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_content" ADD CONSTRAINT "page_content_page_id_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_content" ADD CONSTRAINT "page_content_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_organization_slug_uidx" ON "page" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "page_organization_created_idx" ON "page" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_content_page_version_uidx" ON "page_content" USING btree ("page_id","version");