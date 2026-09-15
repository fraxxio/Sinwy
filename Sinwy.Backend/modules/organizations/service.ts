import { auth, type Membership, polarClient } from "@authModule";
import {
	type OrganizationProfileInput,
	uniqueSlug,
} from "@backend/modules/organizations/utils";
import {
	EMPTY_ORGANIZATION_PROFILE,
	type OrganizationDto,
	type OrganizationIndustry,
	type OrganizationOnboardingDto,
	type OrganizationProfileDto,
	type OrganizationStatus,
} from "@sinwy/shared";
import { reconcileInactiveStatus } from "./reconcileStatus";
import {
	findOnboardingCompletedAt,
	findProfile,
	isSlugTaken,
	markOnboardingCompleted,
	setStatus,
	upsertProfile,
} from "./repository";

export const createOrganization = async (
	userId: string,
	name: string,
	industry: OrganizationIndustry,
): Promise<OrganizationDto> => {
	const slug = await uniqueSlug(name, isSlugTaken);
	// server-side system action: no session headers + explicit userId bypasses
	// allowUserToCreateOrganization: false; creator becomes owner
	const org = await auth.api.createOrganization({
		body: { name, slug, userId, industry },
	});
	if (!org) throw new Error("Organization creation failed");
	return {
		id: org.id,
		name: org.name,
		slug: org.slug,
		// DB column is a plain string; only the webhook projection writes it, with these two values
		status: org.status as OrganizationStatus,
		industry: org.industry as OrganizationIndustry,
	};
};

export const getOrganizationStatus = (
	membership: Membership,
): Promise<OrganizationStatus> =>
	membership.status === "active"
		? Promise.resolve("active")
		: reconcileInactiveStatus(membership.organizationId);

/** Billing projection entry point: Polar subscription state → organization. */
export const setOrganizationStatus = (
	organizationId: string,
	status: OrganizationStatus,
) => setStatus(organizationId, status);

export const getCheckoutOrganization = async (
	userId: string,
	checkoutId: string,
) => {
	// null → unknown checkout, someone else's checkout, or no org reference
	const checkout = await polarClient.checkouts
		.get({ id: checkoutId })
		.catch(() => null);
	if (!checkout || checkout.externalCustomerId !== userId) return null;
	const referenceId = checkout.metadata["referenceId"];
	return typeof referenceId === "string"
		? { organizationId: referenceId }
		: null;
};

type WriteResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: "not-found" | "inactive" };

/**
 * `null` when writable, otherwise the reason to refuse. Onboarding writes are
 * for paid organizations only; the funnel activates before the wizard starts.
 */
const denyInactive = (membership: Membership) =>
	membership.status === "active" ? null : ("inactive" as const);

const toProfileDto = (
	row: Awaited<ReturnType<typeof findProfile>> | undefined,
): OrganizationProfileDto =>
	row
		? {
				tagline: row.tagline,
				description: row.description,
				email: row.email,
				phone: row.phone,
				website: row.website,
				city: row.city,
				country: row.country,
			}
		: EMPTY_ORGANIZATION_PROFILE;

export const getOrganizationOnboarding = async ({
	organizationId,
}: Membership): Promise<OrganizationOnboardingDto> => {
	const [completedAt, profile] = await Promise.all([
		findOnboardingCompletedAt(organizationId),
		findProfile(organizationId),
	]);
	return {
		completedAt: completedAt?.toISOString() ?? null,
		profile: toProfileDto(profile),
	};
};

export const saveOrganizationProfile = async (
	membership: Membership,
	input: OrganizationProfileInput,
): Promise<WriteResult<OrganizationProfileDto>> => {
	const denied = denyInactive(membership);
	if (denied) return { ok: false, error: denied };

	const row = await upsertProfile(membership.organizationId, input);
	return { ok: true, data: toProfileDto(row) };
};

export const completeOrganizationOnboarding = async (
	membership: Membership,
): Promise<WriteResult<{ completedAt: string }>> => {
	const denied = denyInactive(membership);
	if (denied) return { ok: false, error: denied };

	const { organizationId } = membership;
	const completedAt =
		(await markOnboardingCompleted(organizationId)) ??
		(await findOnboardingCompletedAt(organizationId));
	if (!completedAt) return { ok: false, error: "not-found" };

	return { ok: true, data: { completedAt: completedAt.toISOString() } };
};
