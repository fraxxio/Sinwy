import { auth } from "@authModule";
import {
	fileUrl,
	keyFromFileUrl,
	storageClient,
} from "@backend/infrastructure/storage";
import { imageExtension, validateImage } from "@backend/lib/image";
import {
	countUpcomingCustomerBookings,
	countUpcomingOrganizationBookings,
} from "@bookingsModule";
import {
	getMembershipAccess,
	getUnfinishedOnboardingOrganizationId,
	getUnpaidOwnedOrganizationId,
	listSoleOwnedOrganizations,
} from "@organizationsModule";
import {
	type AccountDeletionPreviewDto,
	type AvatarDto,
	OnboardingStep,
	type OrganizationDeletionPreviewDto,
	type PostLoginFlags,
	parseMemberRoles,
	type SetPasswordInput,
} from "@sinwy/shared";
import { isTransferAwaitingCheckout } from "@transfersModule";

type SessionUser = (typeof auth.$Infer.Session)["user"];

/**
 * Prompts the frontend should raise after login. Deliberately reads only
 * cached state: this is polled once per app load, so it must never reach for
 * Polar, reconciling billing stays on GET /organizations/:id/status, which
 * runs when the user actually re-enters the funnel.
 */
export const getPostLoginFlags = async (
	userId: string,
): Promise<PostLoginFlags> => {
	// billing comes first, an unpaid organization can do nothing else
	const unpaid = await getUnpaidOwnedOrganizationId(userId);
	if (unpaid)
		return {
			unfinishedOnboarding: {
				step: OnboardingStep.Plan,
				organizationId: unpaid,
			},
		};

	const unfinished = await getUnfinishedOnboardingOrganizationId(userId);
	return {
		unfinishedOnboarding: unfinished
			? { step: OnboardingStep.Profile, organizationId: unfinished }
			: null,
	};
};

/** Better Auth throws BAD_REQUEST when a credential account already exists. */
export const setPassword = (headers: Headers, input: SetPasswordInput) =>
	auth.api.setPassword({ body: input, headers });

const deleteStoredAvatar = async (image: string | null | undefined) => {
	const key = keyFromFileUrl(image);
	if (key) await storageClient.delete(key);
};

export const uploadAvatar = async (
	headers: Headers,
	user: SessionUser,
	file: File,
): Promise<AvatarDto> => {
	const { bytes, type } = await validateImage(file);
	const key = `avatars/${user.id}/${crypto.randomUUID()}.${imageExtension(type)}`;
	await storageClient.put(key, bytes, type);
	const image = fileUrl(key);
	await auth.api.updateUser({ body: { image }, headers });
	await deleteStoredAvatar(user.image);
	return { image };
};

export const removeAvatar = async (headers: Headers, user: SessionUser) => {
	await auth.api.updateUser({ body: { image: null }, headers });
	await deleteStoredAvatar(user.image);
};

export const getAccountDeletionPreview = async (
	userId: string,
): Promise<AccountDeletionPreviewDto> => {
	const orgs = await listSoleOwnedOrganizations(userId);
	const [upcoming, ownUpcoming] = await Promise.all([
		countUpcomingOrganizationBookings(orgs.map((org) => org.id)),
		countUpcomingCustomerBookings(userId),
	]);
	return {
		soleOwnedOrganizations: orgs.map((org) => ({
			...org,
			upcomingBookings: upcoming.get(org.id) ?? 0,
		})),
		upcomingBookings: ownUpcoming,
	};
};

/** Null unless the user owns the organization and it isn't scheduled for deletion. */
export const getOrganizationDeletionPreview = async (
	userId: string,
	organizationId: string,
): Promise<OrganizationDeletionPreviewDto | null> => {
	const access = await getMembershipAccess(userId, { id: organizationId });
	if (
		!access ||
		access.deletionScheduledAt ||
		!parseMemberRoles(access.role).includes("owner")
	)
		return null;
	const [upcoming, transferAwaitingCheckout] = await Promise.all([
		countUpcomingOrganizationBookings([organizationId]),
		isTransferAwaitingCheckout(organizationId),
	]);
	return {
		upcomingBookings: upcoming.get(organizationId) ?? 0,
		transferAwaitingCheckout,
		holdsSlot: access.slotHeldAt !== null,
	};
};
