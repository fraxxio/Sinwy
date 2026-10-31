CREATE TABLE "availability_exception" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"service_id" text,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"start_time" time,
	"end_time" time,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "availability_exception_kind_check" CHECK ("kind" IN ('closed', 'open')),
	CONSTRAINT "availability_exception_range_check" CHECK (("availability_exception"."start_time" IS NULL AND "availability_exception"."end_time" IS NULL) OR "availability_exception"."start_time" < "availability_exception"."end_time")
);
--> statement-breakpoint
CREATE TABLE "service_availability" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"service_id" text,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "service_availability_weekday_check" CHECK ("service_availability"."weekday" BETWEEN 1 AND 7),
	CONSTRAINT "service_availability_range_check" CHECK ("service_availability"."start_time" < "service_availability"."end_time")
);
--> statement-breakpoint
ALTER TABLE "availability_exception" ADD CONSTRAINT "availability_exception_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_exception" ADD CONSTRAINT "availability_exception_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_availability" ADD CONSTRAINT "service_availability_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_availability" ADD CONSTRAINT "service_availability_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_exception_organization_date_idx" ON "availability_exception" USING btree ("organization_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "availability_exception_org_closed_day_uidx" ON "availability_exception" USING btree ("organization_id","date") WHERE "availability_exception"."service_id" IS NULL AND "availability_exception"."kind" = 'closed' AND "availability_exception"."start_time" IS NULL;--> statement-breakpoint
CREATE INDEX "service_availability_organization_service_idx" ON "service_availability" USING btree ("organization_id","service_id");