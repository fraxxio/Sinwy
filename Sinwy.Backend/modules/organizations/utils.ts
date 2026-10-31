import {
	COUNTRY_CODES,
	DEFAULT_ORGANIZATION_INDUSTRY,
	DEFAULT_TIME_ZONE,
	isTimeZone,
	ORGANIZATION_INDUSTRIES,
	organizationProfileSchema,
} from "@sinwy/shared";
import z from "zod";

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

export const createOrganizationBody = z.object({
	name: z.string().trim().min(1).max(100),
	industry: z
		.enum(ORGANIZATION_INDUSTRIES)
		.default(DEFAULT_ORGANIZATION_INDUSTRY),
	// detected by the browser, so a bad value falls back instead of blocking creation
	timezone: z
		.unknown()
		.optional()
		.transform((value) => (isTimeZone(value) ? value : DEFAULT_TIME_ZONE)),
});

const optional = <T extends z.ZodType<string, string>>(base: T) =>
	z
		.string()
		.nullish()
		.transform((value) => value ?? "")
		.pipe(base);

/** Never trust the form: the shared rules plus canonicalization decide here. */
export const organizationProfileBody = organizationProfileSchema.extend({
	// optional, but people type "example.com", so store something an anchor
	// can point at
	website: optional(organizationProfileSchema.shape.website).transform(
		(value) =>
			value ? (/^https?:\/\//i.test(value) ? value : `https://${value}`) : null,
	),
	city: optional(organizationProfileSchema.shape.city).transform(
		(value) => value || null,
	),
	country: z.enum(COUNTRY_CODES, "Select a country from the list"),
});

export type OrganizationProfileInput = z.infer<typeof organizationProfileBody>;
