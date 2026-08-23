/**
 * Public-facing business details. Independent of how a page is built: the page
 * templates prefill from it, discovery lists it and SEO reads it.
 */
export type OrganizationProfileDto = {
	tagline: string | null;
	description: string | null;
	email: string | null;
	phone: string | null;
	website: string | null;
	city: string | null;
	country: string | null;
};

/**
 * Field rules both the form and the API validate against. The API is the one
 * that counts, the form only gets to say it first.
 */
export const ORGANIZATION_PROFILE_RULES = {
	minLength: 3,
	// scheme optional, the API stores the canonical form
	websitePattern: /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i,
	// every country writes them differently, so only the shape is checked
	phonePattern: /^\+?[\d\s().-]+$/,
	phoneMinDigits: 7,
	phoneMaxDigits: 15,
} as const;

export const countPhoneDigits = (value: string) =>
	value.replace(/\D/g, "").length;

export const ORGANIZATION_PROFILE_LIMITS = {
	tagline: 120,
	description: 600,
	email: 200,
	phone: 40,
	website: 200,
	city: 100,
	country: 100,
} as const satisfies Record<keyof OrganizationProfileDto, number>;

export const EMPTY_ORGANIZATION_PROFILE: OrganizationProfileDto = {
	tagline: null,
	description: null,
	email: null,
	phone: null,
	website: null,
	city: null,
	country: null,
};

/** Where an organization stands in the post-activation setup wizard. */
export type OrganizationOnboardingDto = {
	completedAt: string | null;
	profile: OrganizationProfileDto;
};
