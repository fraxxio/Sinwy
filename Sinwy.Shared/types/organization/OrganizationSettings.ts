import { z } from "zod";
import type { OrganizationBrandingDto } from "./OrganizationBranding";
import type { OrganizationProfileDto } from "./OrganizationProfile";
import { timeZoneSchema } from "./TimeZone";

export const ORGANIZATION_NAME_MAX = 100;

export const organizationNameSchema = z
	.string()
	.trim()
	.min(1, "Name is required")
	.max(ORGANIZATION_NAME_MAX, `Max ${ORGANIZATION_NAME_MAX} characters`);

export const organizationNameInputSchema = z.object({
	name: organizationNameSchema,
});
export type OrganizationNameInput = z.infer<typeof organizationNameInputSchema>;

export const organizationTimezoneInputSchema = z.object({
	timezone: timeZoneSchema,
});
export type OrganizationTimezoneInput = z.infer<
	typeof organizationTimezoneInputSchema
>;

/** Settings → General: what owners and admins edit, plus the read-only slug and currency. */
export type OrganizationGeneralDto = {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	timezone: string;
	/** Follows the country; existing services keep their own. */
	currency: string;
	profile: OrganizationProfileDto;
	branding: OrganizationBrandingDto;
};

export type OrganizationLogoDto = { logo: string };
