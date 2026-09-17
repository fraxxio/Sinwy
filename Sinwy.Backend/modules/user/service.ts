import { auth, polarClient } from "@authModule";
import {
	fileUrl,
	keyFromFileUrl,
	storageClient,
} from "@backend/infrastructure/storage";
import { createLogger } from "@logger";
import { getAccountDeletionPreview as getSoleOwnedOrganizationsPreview } from "@organizationsModule";
import {
	type AccountDeletionPreviewDto,
	type AvatarDto,
	OnboardingStep,
	type PostLoginFlags,
	type SetPasswordInput,
} from "@sinwy/shared";
import { avatarExtension, validateAvatar } from "./avatar";
import {
	findUnfinishedOnboardingOrganization,
	findUnpaidOwnedOrganization,
} from "./repository";

const userLogger = createLogger("user");

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
	const unpaid = await findUnpaidOwnedOrganization(userId);
	if (unpaid)
		return {
			unfinishedOnboarding: {
				step: OnboardingStep.Plan,
				organizationId: unpaid,
			},
		};

	const unfinished = await findUnfinishedOnboardingOrganization(userId);
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
	const { bytes, type } = await validateAvatar(file);
	const key = `avatars/${user.id}/${crypto.randomUUID()}.${avatarExtension(type)}`;
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

export const getAccountDeletionPreview = (
	userId: string,
): Promise<AccountDeletionPreviewDto> =>
	getSoleOwnedOrganizationsPreview(userId);

/** Best-effort cleanup after the user row is gone; failures are logged, never surfaced. */
export const cleanupDeletedUser = async (user: {
	id: string;
	image?: string | null | undefined;
}) => {
	try {
		await deleteStoredAvatar(user.image);
	} catch (error) {
		userLogger.warn("Failed to delete avatar of deleted user", {
			userId: user.id,
			error,
		});
	}
	try {
		await polarClient.customers.deleteExternal({ externalId: user.id });
	} catch (error) {
		userLogger.warn("Failed to delete Polar customer of deleted user", {
			userId: user.id,
			error,
		});
	}
};
