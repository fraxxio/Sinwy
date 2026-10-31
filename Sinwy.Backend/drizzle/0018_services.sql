CREATE TABLE "service" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_duration_check" CHECK ("service"."duration_minutes" BETWEEN 5 AND 720),
	CONSTRAINT "service_price_check" CHECK ("service"."price_minor" >= 0),
	CONSTRAINT "service_buffers_check" CHECK ("service"."buffer_before_minutes" BETWEEN 0 AND 240 AND "service"."buffer_after_minutes" BETWEEN 0 AND 240),
	CONSTRAINT "service_capacity_check" CHECK ("service"."capacity" >= 1)
);
--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_organizationId_idx" ON "service" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_organization_slug_uidx" ON "service" USING btree ("organization_id","slug") WHERE "service"."archived_at" IS NULL;