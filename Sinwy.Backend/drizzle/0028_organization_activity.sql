CREATE TABLE "organization_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text,
	"actor_name" text,
	"action" text NOT NULL,
	"details" jsonb NOT NULL,
	"occurred_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_activity" ADD CONSTRAINT "organization_activity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_activity" ADD CONSTRAINT "organization_activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_activity_org_occurred_idx" ON "organization_activity" USING btree ("organization_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "organization_activity_occurred_idx" ON "organization_activity" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "organization_activity_actor_idx" ON "organization_activity" USING btree ("actor_user_id");