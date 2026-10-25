import { auth, type Membership } from "@authModule";
import {
	type OrganizationProfileInput,
	uniqueSlug,
} from "@backend/modules/organizations/utils";
import { revokeOrganizationSubscription } from "@billingModule";
import {
	type AccountDeletionPreviewDto,
	EMPTY_ORGANIZATION_PROFILE,
	ORGANIZATION_RETENTION_DAYS,
	type OrganizationDto,
	type OrganizationIndustry,
	type OrganizationOnboardingDto,
	type OrganizationProfileDto,
	type OrganizationStatus,
	type OrganizationSummary,
	type PlanSlug,
	parseMemberRoles,
	toOrganizationStatus,
	toPlanSlug,
} from "@sinwy/shared";
import {
	bindSubscription,
	findDeletionScheduledAt,
	findMemberOrganizations,
	findOnboardingCompletedAt,
	findProfile,
	findSoleOwnedOrganizations,
	findSubscriptionState,
	findUnfinishedOnboardingOrganization,
	findUnpaidOwnedOrganization,
	isSlugTaken,
	markOnboardingCompleted,
	pauseSubscription,
	releaseSubscription,
	scheduleOrganizationsForDeletion,
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
		plan: toPlanSlug(org.plan ?? null),
		industry: org.industry as OrganizationIndustry,
	};
};

/**
 * Active and not scheduled for deletion: the only state in which members may
 * open the organization. Public pages, booking pages and custom-domain
 * resolution must serve an organization only when this holds.
 */
export const isOrganizationPublic = (org: {
	status: string;
	deletionScheduledAt: Date | null;
}) => org.status === "active" && org.deletionScheduledAt === null;

/** Inactive with its paused subscription still bound; see `pauseSubscription`. */
export const isSuspended = (state: {
	status: string;
	subscriptionId: string | null;
}) => state.status !== "active" && state.subscriptionId !== null;

export const RETENTION_MS = ORGANIZATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const deletesAtOf = (deletionScheduledAt: Date | null) =>
	deletionScheduledAt &&
	new Date(deletionScheduledAt.getTime() + RETENTION_MS).toISOString();

export const isScheduledForDeletion = async (organizationId: string) =>
	(await findDeletionScheduledAt(organizationId)) !== null;

export const listOrganizations = async (
	userId: string,
): Promise<OrganizationSummary[]> => {
	const rows = await findMemberOrganizations(userId);
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		slug: row.slug,
		status: toOrganizationStatus(row.status),
		suspended: isSuspended(row),
		plan: toPlanSlug(row.plan),
		isOwner: parseMemberRoles(row.role).includes("owner"),
		deletesAt: deletesAtOf(row.deletionScheduledAt),
		onboardingCompletedAt: row.onboardingCompletedAt?.toISOString() ?? null,
	}));
};

export type SubscriptionState = {
	status: OrganizationStatus;
	plan: PlanSlug | null;
	subscriptionId: string | null;
};

/** null for an unknown organization. */
export const getSubscriptionState = async (
	organizationId: string,
): Promise<SubscriptionState | null> => {
	const row = await findSubscriptionState(organizationId);
	return row
		? {
				status: toOrganizationStatus(row.status),
				plan: toPlanSlug(row.plan),
				subscriptionId: row.subscriptionId,
			}
		: null;
};

/**
 * Billing projection writes. Each refuses a subscription other than the one
 * currently backing the organization, state observed no later than the
 * applied one, and an unknown organization, and report which it was.
 */
export const activateSubscription = (
	organizationId: string,
	subscriptionId: string,
	plan: PlanSlug | null,
	observedAt: Date,
) => bindSubscription(organizationId, subscriptionId, plan, observedAt);

export const suspendSubscription = (
	organizationId: string,
	subscriptionId: string,
	observedAt: Date,
) => pauseSubscription(organizationId, subscriptionId, observedAt);

export const deactivateSubscription = (
	organizationId: string,
	subscriptionId: string,
	observedAt: Date,
) => releaseSubscription(organizationId, subscriptionId, observedAt);

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

export const getAccountDeletionPreview = async (
	userId: string,
): Promise<AccountDeletionPreviewDto> => {
	const rows = await findSoleOwnedOrganizations(userId);
	return {
		soleOwnedOrganizations: rows.map((row) => ({
			id: row.id,
			name: row.name,
			status: toOrganizationStatus(row.status),
		})),
	};
};

/** Post-login prompts: the oldest owned org that still has to pay, then one that has to finish onboarding. */
export const getUnpaidOwnedOrganizationId = findUnpaidOwnedOrganization;
export const getUnfinishedOnboardingOrganizationId =
	findUnfinishedOnboardingOrganization;

/**
 * Revokes each owned organization's billable Polar subscriptions, then
 * schedules them all for deletion. A revoke failure throws before anything
 * is scheduled.
 */
export const scheduleOwnedOrganizationsForDeletion = async (userId: string) => {
	const orgs = await findSoleOwnedOrganizations(userId);
	if (orgs.length === 0) return;
	for (const org of orgs) await revokeOrganizationSubscription(org.id);
	await scheduleOrganizationsForDeletion(
		orgs.map((org) => org.id),
		new Date(),
	);
};
