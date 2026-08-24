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
	// every country writes them differently, so only the shape is checked
	phonePattern: /^\+?[\d\s().-]+$/,
	phoneMinDigits: 7,
	phoneMaxDigits: 15,
} as const;

/**
 * Scheme optional, the API stores the canonical https form. The stored value
 * must be something an anchor can point at, so it has to survive the URL
 * parser and resolve to a plausible hostname.
 */
export const isValidWebsite = (value: string) => {
	const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
	try {
		return /^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/i.test(new URL(candidate).hostname);
	} catch {
		return false;
	}
};

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
