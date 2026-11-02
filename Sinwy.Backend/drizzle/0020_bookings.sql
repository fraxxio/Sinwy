CREATE TABLE "booking" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"service_id" text NOT NULL,
	"customer_user_id" text,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"buffer_before_minutes" integer NOT NULL,
	"buffer_after_minutes" integer NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"status" text NOT NULL,
	"cancelled_by" text,
	"cancellation_reason" text,
	"customer_note" text,
	"internal_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_status_check" CHECK ("status" IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
	CONSTRAINT "booking_cancelled_by_check" CHECK ("cancelled_by" IN ('customer', 'organization')),
	CONSTRAINT "booking_cancelled_check" CHECK (("booking"."cancelled_by" IS NOT NULL) = ("booking"."status" = 'cancelled')),
	CONSTRAINT "booking_range_check" CHECK ("booking"."starts_at" < "booking"."ends_at"),
	CONSTRAINT "booking_contact_check" CHECK ("booking"."customer_email" IS NOT NULL OR "booking"."customer_phone" IS NOT NULL OR "booking"."customer_user_id" IS NOT NULL),
	CONSTRAINT "booking_price_check" CHECK ("booking"."price_minor" >= 0),
	CONSTRAINT "booking_buffers_check" CHECK ("booking"."buffer_before_minutes" >= 0 AND "booking"."buffer_after_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "booking_event" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"actor_type" text NOT NULL,
	"actor_user_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_event_type_check" CHECK ("type" IN ('created', 'status_changed', 'rescheduled', 'contact_updated')),
	CONSTRAINT "booking_event_from_status_check" CHECK ("from_status" IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
	CONSTRAINT "booking_event_to_status_check" CHECK ("to_status" IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
	CONSTRAINT "booking_event_actor_type_check" CHECK ("actor_type" IN ('member', 'customer', 'system'))
);
--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "requires_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_customer_user_id_user_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_event" ADD CONSTRAINT "booking_event_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_event" ADD CONSTRAINT "booking_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_organization_starts_at_idx" ON "booking" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "booking_customer_starts_at_idx" ON "booking" USING btree ("customer_user_id","starts_at");--> statement-breakpoint
CREATE INDEX "booking_event_booking_occurred_at_idx" ON "booking_event" USING btree ("booking_id","occurred_at");