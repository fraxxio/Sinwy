import { describePolarError, polarClient } from "@backend/infrastructure/polar";
import { keyFromFileUrl, storageClient } from "@backend/infrastructure/storage";
import { createLogger } from "@logger";

const authLogger = createLogger("auth");

/**
 * A user only ever pays for organizations they own, and those were revoked
 * and deleted before the user, so the Polar customer has nothing left to bill.
 */
const deletePolarCustomer = (userId: string) =>
	polarClient.customers.deleteExternal({ externalId: userId });

/** Best-effort cleanup after the user row is gone; failures are logged, never surfaced. */
export const cleanupDeletedUser = async (user: {
	id: string;
	image?: string | null | undefined;
}) => {
	try {
		const key = keyFromFileUrl(user.image);
		if (key) await storageClient.delete(key);
	} catch (error) {
		authLogger.warn("Failed to delete avatar of deleted user", {
			userId: user.id,
			error,
		});
	}
	try {
		await deletePolarCustomer(user.id);
	} catch (error) {
		authLogger.warn("Failed to delete Polar customer of deleted user", {
			userId: user.id,
			...describePolarError(error),
		});
	}
};
