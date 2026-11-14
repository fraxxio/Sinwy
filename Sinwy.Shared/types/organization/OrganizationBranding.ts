import { z } from "zod";

export const BRAND_FONTS = [
	"modern",
	"friendly",
	"classic",
	"elegant",
	"technical",
] as const;
export type BrandFont = (typeof BRAND_FONTS)[number];

export const BRAND_FONT_LABELS: Record<BrandFont, string> = {
	modern: "Modern",
	friendly: "Friendly",
	classic: "Classic",
	elegant: "Elegant",
	technical: "Technical",
};

export const BRAND_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

export const brandColorSchema = z
	.string()
	.trim()
	.toLowerCase()
	.regex(BRAND_COLOR_PATTERN, "Use a color like #0f766e");

/** Null means Sinwy's default for that part. */
export const organizationBrandingSchema = z
	.object({
		color: brandColorSchema.nullable(),
		font: z.enum(BRAND_FONTS, "Pick one of the listed fonts").nullable(),
	})
	.strict();
export type OrganizationBrandingDto = z.infer<
	typeof organizationBrandingSchema
>;

export const BRAND_TEXT_LIGHT = "#ffffff";
export const BRAND_TEXT_DARK = "#0a0a0a";

const luminance = (hex: string) => {
	const [r, g, b] = [1, 3, 5].map((start) => {
		const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
		return channel <= 0.04045
			? channel / 12.92
			: ((channel + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: number, b: number) =>
	(Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The text color for a `#rrggbb` background: white or near-black, whichever contrasts more. */
export const brandTextColor = (color: string) => {
	const background = luminance(color);
	return contrast(background, luminance(BRAND_TEXT_LIGHT)) >=
		contrast(background, luminance(BRAND_TEXT_DARK))
		? BRAND_TEXT_LIGHT
		: BRAND_TEXT_DARK;
};
