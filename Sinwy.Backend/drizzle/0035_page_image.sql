CREATE TABLE "page_image" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "page_image_key_unique" UNIQUE("key"),
	CONSTRAINT "page_image_bytes_check" CHECK ("page_image"."bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "page_image" ADD CONSTRAINT "page_image_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_image_organization_created_idx" ON "page_image" USING btree ("organization_id","created_at");