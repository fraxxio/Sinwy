import { auth, polarClient } from "@authModule";
import {
	type OrganizationProfileInput,
	uniqueSlug,
} from "@backend/modules/organizations/utils";
import { parseMemberRoles } from "@db/memberRole";
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
	findMembership,
	findOnboardingCompletedAt,
	findProfile,
	findStatusForMember,
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

export const getOrganizationStatus = async (
	userId: string,
	organizationId: string,
): Promise<OrganizationStatus | null> => {
	// null → org doesn't exist or caller isn't a member (both read as not-found)
	const status = await findStatusForMember(userId, organizationId);
	if (status === null) return null;
	if (status === "active") return "active";
	return reconcileInactiveStatus(organizationId);
};

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
	| { ok: false; error: "not-found" | "forbidden" | "inactive" };

const canManage = (role: string) =>
	parseMemberRoles(role).some((r) => r === "owner" || r === "admin");

/**
 * `null` when allowed, otherwise the reason to refuse. Onboarding writes are
 * for paid organizations only; the funnel activates before the wizard starts.
 */
const denyManage = async (userId: string, organizationId: string) => {
	const membership = await findMembership(userId, organizationId);
	if (!membership) return "not-found" as const;
	if (!canManage(membership.role)) return "forbidden" as const;
	return membership.status === "active" ? null : ("inactive" as const);
};

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

export const getOrganizationOnboarding = async (
	userId: string,
	organizationId: string,
): Promise<OrganizationOnboardingDto | null> => {
	// null → org doesn't exist or caller isn't a member (both read as not-found)
	const membership = await findMembership(userId, organizationId);
	if (!membership) return null;

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
	userId: string,
	organizationId: string,
	input: OrganizationProfileInput,
): Promise<WriteResult<OrganizationProfileDto>> => {
	const denied = await denyManage(userId, organizationId);
	if (denied) return { ok: false, error: denied };

	const row = await upsertProfile(organizationId, input);
	return { ok: true, data: toProfileDto(row) };
};

export const completeOrganizationOnboarding = async (
	userId: string,
	organizationId: string,
): Promise<WriteResult<{ completedAt: string }>> => {
	const denied = await denyManage(userId, organizationId);
	if (denied) return { ok: false, error: denied };

	const completedAt =
		(await markOnboardingCompleted(organizationId)) ??
		(await findOnboardingCompletedAt(organizationId));
	if (!completedAt) return { ok: false, error: "not-found" };

	return { ok: true, data: { completedAt: completedAt.toISOString() } };
};
