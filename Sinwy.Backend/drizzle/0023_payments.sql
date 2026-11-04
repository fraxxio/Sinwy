CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_status_check" CHECK ("status" IN ('pending', 'paid', 'void', 'refunded')),
	CONSTRAINT "payment_provider_check" CHECK ("provider" IN ('manual')),
	CONSTRAINT "payment_amount_check" CHECK ("payment"."amount_minor" >= 0),
	CONSTRAINT "payment_paid_at_check" CHECK (("payment"."paid_at" IS NOT NULL) = ("payment"."status" = 'paid'))
);
--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_booking_id_idx" ON "payment" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payment_organization_created_at_idx" ON "payment" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_ref_idx" ON "payment" USING btree ("provider","provider_ref");--> statement-breakpoint
INSERT INTO "payment" ("id", "organization_id", "booking_id", "amount_minor", "currency", "status", "provider", "created_at", "updated_at") SELECT gen_random_uuid()::text, "organization_id", "id", "price_minor", "currency", CASE WHEN "status" = 'cancelled' THEN 'void' ELSE 'pending' END, 'manual', "created_at" AT TIME ZONE 'UTC', now() FROM "booking" WHERE "price_minor" > 0;
