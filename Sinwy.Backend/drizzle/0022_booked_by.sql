ALTER TABLE "booking" ADD COLUMN "booked_by" text;--> statement-breakpoint
UPDATE "booking" SET "booked_by" = CASE WHEN EXISTS (SELECT 1 FROM "booking_event" WHERE "booking_event"."booking_id" = "booking"."id" AND "booking_event"."type" = 'created' AND "booking_event"."actor_type" = 'customer') THEN 'customer' ELSE 'organization' END;--> statement-breakpoint
ALTER TABLE "booking" ALTER COLUMN "booked_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_booked_by_check" CHECK ("booked_by" IN ('customer', 'organization'));--> statement-breakpoint
UPDATE "booking_event" SET "payload" = ("payload" #>> '{}')::jsonb WHERE jsonb_typeof("payload") = 'string';
