CREATE TABLE "analytics_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"page_id" text,
	"kind" text NOT NULL,
	"local_date" date NOT NULL,
	"visitor_hash" text NOT NULL,
	"referrer_host" text,
	"device" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_event_kind_check" CHECK ("kind" IN ('view', 'booking_started')),
	CONSTRAINT "analytics_event_device_check" CHECK ("device" IN ('mobile', 'tablet', 'desktop'))
);
--> statement-breakpoint
CREATE TABLE "analytics_salt" (
	"local_date" date PRIMARY KEY NOT NULL,
	"salt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_event" ADD CONSTRAINT "analytics_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_event" ADD CONSTRAINT "analytics_event_page_id_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_event_organization_date_idx" ON "analytics_event" USING btree ("organization_id","local_date");