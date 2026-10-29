import type { Membership } from "@authModule";
import { uniqueSlug } from "@backend/lib/slug";
import {
	type OrganizationProfileInput,
	reservedSlugs,
} from "@backend/modules/organizations/utils";
import db from "@db";
import {
	type AccountDeletionPreviewDto,
	currencyForCountry,
	EMPTY_ORGANIZATION_PROFILE,
	featuresFor,
	hasPermission,
	ORGANIZATION_RETENTION_DAYS,
	type OrganizationDto,
	type OrganizationIndustry,
	type OrganizationOnboardingDto,
	type OrganizationProfileDto,
	type OrganizationStatus,
	type OrganizationSummary,
	type PlanSlug,
	parseMemberRoles,
	toPlanSlug,
} from "@sinwy/shared";
import { clearFromSessions, type OrganizationAccess, type Tx } from "./access";
import {
	countOwnedHeldSlots,
	findDeletionScheduledAt,
	findInvitationOrganizationId,
	findMemberOrganizations,
	findMembershipAccess,
	findOnboardingCompletedAt,
	findOrganizationAccess,
	findOrganizationLocale,
	findOwnedOrganizationIds,
	findProfile,
	findSoleOwnedOrganizations,
	findUnfinishedOnboardingOrganization,
	findUnpaidOwnedOrganization,
	hasFreeSlot,
	insertOrganizationWithOwner,
	isSlugTaken,
	markOnboardingCompleted,
	scheduleOrganizationsForDeletion,
	updateOrganizationTimezone,
	upsertProfile,
} from "./repository";
import { holdSlot, releaseSlot, type SlotHold } from "./slots";

export const createOrganization = async (
	userId: string,
	name: string,
	industry: OrganizationIndustry,
	timezone: string,
): Promise<OrganizationDto> => {
	const slug = await uniqueSlug(
		name,
		async (candidate) =>
			reservedSlugs.has(candidate) || (await isSlugTaken(candidate)),
	);
	const org = await insertOrganizationWithOwner(
		{ name, slug, industry, timezone },
		userId,
	);
	// a new organization, not a freed slot, so it takes one when it can;
	// otherwise it stays a draft
	const hold = await holdSlot(userId, org.id);
	const state = await getOrganizationState(org.id);
	const active = hold.result === "held" && state?.status === "active";
	return {
		id: org.id,
		name: org.name,
		slug: org.slug,
		status: active ? "active" : "inactive",
		plan: active ? state.ownerPlan : null,
		industry: org.industry as OrganizationIndustry,
	};
};

/**
 * Active: it holds one of its owner's slots, the owner's plan grants access,
 * and it isn't scheduled for deletion. The only state in which members may
 * open the organization. Public pages, booking pages and custom-domain
 * resolution must serve an organization only when this holds.
 */
export const isOrganizationPublic = (access: OrganizationAccess) =>
	access.slotHeldAt !== null &&
	access.deletionScheduledAt === null &&
	access.ownerPlan !== null;

export const organizationStatusOf = (
	access: OrganizationAccess,
): OrganizationStatus => (isOrganizationPublic(access) ? "active" : "inactive");

/** The owner's plan as far as the organization may use it: none while inactive. */
export const organizationPlanOf = (access: OrganizationAccess) =>
	isOrganizationPublic(access) ? toPlanSlug(access.ownerPlan) : null;

/** Holds a slot, but its owner paused their plan; it resumes without a new checkout. */
export const isSuspended = (access: OrganizationAccess) =>
	access.slotHeldAt !== null &&
	access.deletionScheduledAt === null &&
	access.ownerSubscriptionStatus === "paused";

/** Never finished setup and holds no slot; its setup may go on before a slot is free. */
export const isDraft = (
	access: OrganizationAccess & { onboardingCompletedAt: Date | null },
) =>
	access.slotHeldAt === null &&
	access.onboardingCompletedAt === null &&
	access.deletionScheduledAt === null;

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
	return rows.map((row) => {
		const roles = parseMemberRoles(row.role);
		const plan = organizationPlanOf(row);
		return {
			id: row.id,
			name: row.name,
			slug: row.slug,
			status: organizationStatusOf(row),
			suspended: isSuspended(row),
			draft: isDraft(row),
			// billing is the owner's; admins see the tier name only, staff nothing
			plan: hasPermission(roles, "settings:manage") ? plan : null,
			features: featuresFor(plan),
			isOwner: roles.includes("owner"),
			paymentFailed:
				roles.includes("owner") && row.ownerSubscriptionStatus === "past_due",
			deletesAt: deletesAtOf(row.deletionScheduledAt),
			onboardingCompletedAt: row.onboardingCompletedAt?.toISOString() ?? null,
		};
	});
};

/** The user's raw role column and the organization's access; null when not a member. */
export const getMembershipAccess = findMembershipAccess;

export const getInvitationOrganizationId = findInvitationOrganizationId;

/** The organization's name, owner and access; null for an unknown one. */
export const getOrganizationAccess = findOrganizationAccess;

export type OrganizationState = {
	status: OrganizationStatus;
	slotHeld: boolean;
	/** The owner's plan while it grants access, active or not. */
	ownerPlan: PlanSlug | null;
	ownerUserId: string | null;
};

/** null for an unknown organization. */
export const getOrganizationState = async (
	organizationId: string,
): Promise<OrganizationState | null> => {
	const row = await findOrganizationAccess(organizationId);
	return row
		? {
				status: organizationStatusOf(row),
				slotHeld: row.slotHeldAt !== null,
				ownerPlan: toPlanSlug(row.ownerPlan),
				ownerUserId: row.ownerUserId,
			}
		: null;
};

export const listOwnedOrganizationIds = async (userId: string) =>
	(await findOwnedOrganizationIds(userId)).map((row) => row.id);

/** Takes every organization the user owns out of the sessions that have it open. */
export const closeOwnedOrganizations = async (userId: string) =>
	clearFromSessions(db, await listOwnedOrganizationIds(userId));

/** Owned organizations holding a slot, not scheduled for deletion. */
export const countHeldSlots = countOwnedHeldSlots;

export type SlotResult = Exclude<SlotHold, { result: "held" }>["result"];

/** Owner only; refused without a plan that grants access, or at the plan's cap. */
export const activateOrganization = async (
	userId: string,
	organizationId: string,
): Promise<{ ok: true } | { ok: false; error: SlotResult }> => {
	const hold = await holdSlot(userId, organizationId);
	return hold.result === "held"
		? { ok: true }
		: { ok: false, error: hold.result };
};

/** Owner only; frees the slot for another organization. Never automatically refilled. */
export const deactivateOrganization = releaseSlot;

type WriteResult<T, E = never> =
	| { ok: true; data: T }
	| { ok: false; error: "not-found" | "inactive" | E };

/**
 * The wizard writes to active organizations and to drafts, so setup can
 * start before a slot is free (D5). `null` for an unknown organization.
 */
const findWizardTarget = async ({ organizationId, status }: Membership) => {
	const row = await findOrganizationAccess(organizationId);
	if (!row) return null;
	return {
		writable: status === "active" || isDraft(row),
		draft: isDraft(row),
		ownerUserId: row.ownerUserId,
	};
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
	const target = await findWizardTarget(membership);
	if (!target) return { ok: false, error: "not-found" };
	if (!target.writable) return { ok: false, error: "inactive" };

	const row = await upsertProfile(
		membership.organizationId,
		input,
		currencyForCountry(input.country),
	);
	return { ok: true, data: toProfileDto(row) };
};

export type OrganizationLocale = { timezone: string; currency: string };

/** The zone its hours are kept in and the currency new services price in. */
export const getOrganizationLocale = (
	organizationId: string,
): Promise<OrganizationLocale | null> => findOrganizationLocale(organizationId);

/** Callers validate the zone (`isTimeZone`); pass `executor` to join their transaction. */
export const setOrganizationTimezone = async (
	organizationId: string,
	timezone: string,
	executor: Tx | typeof db = db,
) => {
	await updateOrganizationTimezone(executor, organizationId, timezone);
};

/**
 * Finishing a draft's wizard takes one of its owner's free slots (Default 10);
 * without a plan or at the cap it stays a draft. Only the owner fills their
 * slot (D7), so an admin can't finish a draft.
 */
export const completeOrganizationOnboarding = async (
	membership: Membership,
): Promise<WriteResult<{ completedAt: string }, SlotResult>> => {
	const target = await findWizardTarget(membership);
	if (!target?.ownerUserId) return { ok: false, error: "not-found" };
	if (!target.writable) return { ok: false, error: "inactive" };

	const { organizationId } = membership;
	if (target.draft) {
		if (!membership.roles.includes("owner"))
			return { ok: false, error: "inactive" };
		const hold = await holdSlot(target.ownerUserId, organizationId);
		if (hold.result !== "held") return { ok: false, error: hold.result };
	}
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
			status: organizationStatusOf(row),
		})),
	};
};

/** Post-login prompts: the oldest owned draft while there is no plan to pay for it. */
export const getUnpaidOwnedOrganizationId = findUnpaidOwnedOrganization;

/** Then the oldest owned org whose wizard is unfinished: active, or a draft when a slot is free for it. */
export const getUnfinishedOnboardingOrganizationId = async (userId: string) =>
	findUnfinishedOnboardingOrganization(userId, await hasFreeSlot(userId));

/** Takes every owned organization out of service for the retention period. */
export const scheduleOwnedOrganizationsForDeletion = async (userId: string) => {
	const orgs = await findSoleOwnedOrganizations(userId);
	if (orgs.length === 0) return;
	await scheduleOrganizationsForDeletion(
		orgs.map((org) => org.id),
		new Date(),
	);
};
