ALTER TABLE "booking" ADD COLUMN "cancellation_window_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "cancellation_window_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_cancellation_window_check" CHECK ("booking"."cancellation_window_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_cancellation_window_check" CHECK ("service"."cancellation_window_minutes" >= 0);