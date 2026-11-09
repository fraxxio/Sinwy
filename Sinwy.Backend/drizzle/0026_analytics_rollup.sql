CREATE TABLE "analytics_daily" (
	"organization_id" text NOT NULL,
	"local_date" date NOT NULL,
	"metric" text NOT NULL,
	"key" text DEFAULT '' NOT NULL,
	"events" integer NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "analytics_daily_organization_id_local_date_metric_key_pk" PRIMARY KEY("organization_id","local_date","metric","key"),
	CONSTRAINT "analytics_daily_metric_check" CHECK ("metric" IN ('total', 'booking_started', 'referrer', 'device'))
);
--> statement-breakpoint
CREATE TABLE "analytics_page_daily" (
	"organization_id" text NOT NULL,
	"local_date" date NOT NULL,
	"page_id" text,
	"views" integer NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "analytics_page_daily_organization_date_page_unique" UNIQUE NULLS NOT DISTINCT("organization_id","local_date","page_id")
);
--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_page_daily" ADD CONSTRAINT "analytics_page_daily_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_page_daily" ADD CONSTRAINT "analytics_page_daily_page_id_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;