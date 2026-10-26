CREATE TABLE "organization_transfer" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"checkout_id" text,
	"old_subscription_id" text,
	"new_subscription_id" text,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_transfer_status_check" CHECK ("status" IN ('pending', 'accepted', 'completed', 'declined', 'canceled', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "organization_transfer" ADD CONSTRAINT "organization_transfer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_transfer" ADD CONSTRAINT "organization_transfer_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_transfer" ADD CONSTRAINT "organization_transfer_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_transfer_toUserId_idx" ON "organization_transfer" USING btree ("to_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_transfer_one_open_uidx" ON "organization_transfer" USING btree ("organization_id") WHERE "organization_transfer"."status" IN ('pending', 'accepted');