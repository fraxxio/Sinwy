ALTER TABLE "organization" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "brand_font" text;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_brand_color_check" CHECK ("organization"."brand_color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_brand_font_check" CHECK ("brand_font" IN ('modern', 'friendly', 'classic', 'elegant', 'technical'));