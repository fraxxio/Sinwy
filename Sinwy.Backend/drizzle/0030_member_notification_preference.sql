CREATE TABLE "member_notification_preference" (
	"member_id" text PRIMARY KEY NOT NULL,
	"email_booking_new" boolean DEFAULT true NOT NULL,
	"email_booking_cancelled_by_customer" boolean DEFAULT true NOT NULL,
	"email_payment_recorded" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_notification_preference" ADD CONSTRAINT "member_notification_preference_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;