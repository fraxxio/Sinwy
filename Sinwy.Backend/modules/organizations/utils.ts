import {
	COUNTRY_CODES,
	countPhoneDigits,
	DEFAULT_ORGANIZATION_INDUSTRY,
	ORGANIZATION_INDUSTRIES,
	ORGANIZATION_PROFILE_LIMITS,
	ORGANIZATION_PROFILE_RULES,
} from "@sinwy/shared";
import z from "zod";

export const slugify = (name: string) =>
	name
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "org";

// The dashboard lives at /<slug>/*, so a slug matching a top-level path would
// shadow it. Reserving eagerly is the cheap side: a slug already handed out
// can't be taken back when we later want the route.
export const reservedSlugs = new Set([
	"about",
	"account",
	"admin",
	"api",
	"auth",
	"billing",
	"blog",
	"checkout",
	"contact",
	"docs",
	"help",
	"login",
	"organizations",
	"pricing",
	"privacy",
	"settings",
	"signup",
	"support",
	"terms",
]);

export const uniqueSlug = async (
	name: string,
	isTaken: (slug: string) => Promise<boolean>,
) => {
	const base = slugify(name);
	let slug = base;
	// ponytail: 5 attempts is plenty — a 6-char random suffix colliding twice never happens in practice
	for (
		let i = 0;
		i < 5 && (reservedSlugs.has(slug) || (await isTaken(slug)));
		i++
	) {
		slug = `${base}-${Math.random().toString(36).slice(2, 8)}`;
	}
	return slug;
};

export const createOrganizationBody = z.object({
	name: z.string().trim().min(1).max(100),
	industry: z
		.enum(ORGANIZATION_INDUSTRIES)
		.default(DEFAULT_ORGANIZATION_INDUSTRY),
});

const RULES = ORGANIZATION_PROFILE_RULES;

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

/** Never trust the form: these mirror it, and they are what actually decides. */
export const organizationProfileBody = z.object({
	tagline: requiredText("Tagline", ORGANIZATION_PROFILE_LIMITS.tagline),
	description: requiredText(
		"A description",
		ORGANIZATION_PROFILE_LIMITS.description,
	),
	email: z
		.string()
		.trim()
		.min(1, "Contact email is required")
		.max(ORGANIZATION_PROFILE_LIMITS.email)
		.pipe(z.email("Enter a valid email address")),
	phone: z
		.string()
		.trim()
		.min(1, "Phone number is required")
		.max(ORGANIZATION_PROFILE_LIMITS.phone)
		.regex(RULES.phonePattern, "Use digits, spaces and + ( ) - . only")
		.refine((value) => {
			const digits = countPhoneDigits(value);
			return digits >= RULES.phoneMinDigits && digits <= RULES.phoneMaxDigits;
		}, `Enter ${RULES.phoneMinDigits} to ${RULES.phoneMaxDigits} digits`),
	// optional, but people type "example.com", so store something an anchor
	// can point at
	website: z
		.string()
		.nullish()
		.transform((value) => value?.trim() ?? "")
		.refine(
			(value) => value.length <= ORGANIZATION_PROFILE_LIMITS.website,
			`Max ${ORGANIZATION_PROFILE_LIMITS.website} characters`,
		)
		.refine(
			(value) => !value || RULES.websitePattern.test(value),
			"Enter a valid website, like example.com",
		)
		.transform((value) =>
			value ? (/^https?:\/\//i.test(value) ? value : `https://${value}`) : null,
		),
	city: z
		.string()
		.trim()
		.max(ORGANIZATION_PROFILE_LIMITS.city)
		.nullish()
		.transform((value) => value || null),
	country: z.enum(COUNTRY_CODES, "Select a country from the list"),
});

export type OrganizationProfileInput = z.infer<typeof organizationProfileBody>;
