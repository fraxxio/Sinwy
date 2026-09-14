ALTER TABLE "member" ALTER COLUMN "role" SET DEFAULT 'staff';--> statement-breakpoint
UPDATE "member" SET "role" = 'admin' WHERE "role" = 'member';
