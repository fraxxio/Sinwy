import { z } from "zod";
import {
	countPhoneDigits,
	isValidWebsite,
	ORGANIZATION_PROFILE_LIMITS as LIMITS,
	ORGANIZATION_PROFILE_RULES as RULES,
} from "./OrganizationProfile";

const requiredText = (label: string, max: number) =>
	z
		.string()
		.trim()
		.min(1, `${label} is required`)
		.min(
			RULES.minLength,
			`${label} needs at least ${RULES.minLength} characters`,
		)
		.max(max, `Max ${max} characters`);

/**
 * The rules the form and the API both enforce, with the messages either side
 * shows. The API layers canonicalization on top (website stored as https://…,
 * country narrowed to known codes); the form is the plain version below.
 */
export const organizationProfileSchema = z.object({
	tagline: requiredText("Tagline", LIMITS.tagline),
	description: requiredText("A description", LIMITS.description),
	email: z
		.string()
		.trim()
		.min(1, "Contact email is required")
		.max(LIMITS.email, `Max ${LIMITS.email} characters`)
		.pipe(z.email("Enter a valid email address")),
	phone: z
		.string()
		.trim()
		.min(1, "Phone number is required")
		.max(LIMITS.phone, `Max ${LIMITS.phone} characters`)
		.regex(RULES.phonePattern, "Use digits, spaces and + ( ) - . only")
		.refine((value) => {
			const digits = countPhoneDigits(value);
			return digits >= RULES.phoneMinDigits && digits <= RULES.phoneMaxDigits;
		}, `Enter ${RULES.phoneMinDigits} to ${RULES.phoneMaxDigits} digits, including the country code`),
	website: z
		.string()
		.trim()
		.max(LIMITS.website, `Max ${LIMITS.website} characters`)
		.refine(
			(value) => !value || isValidWebsite(value),
			"Enter a valid website, like example.com",
		),
	city: z.string().trim().max(LIMITS.city, `Max ${LIMITS.city} characters`),
	// picked from a list, so the API is what checks it is a country we know
	country: z.string().trim().min(1, "Country is required"),
});
