CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"member_id" text,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"link" text,
	"read_at" timestamp,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "notification_member_has_organization" CHECK (("notification"."organization_id" is null) = ("notification"."member_id" is null))
);
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_user_org_created_idx" ON "notification" USING btree ("user_id","organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "notification_unread_idx" ON "notification" USING btree ("user_id","organization_id") WHERE "notification"."read_at" is null;--> statement-breakpoint
CREATE INDEX "notification_created_idx" ON "notification" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notification_member_idx" ON "notification" USING btree ("member_id");