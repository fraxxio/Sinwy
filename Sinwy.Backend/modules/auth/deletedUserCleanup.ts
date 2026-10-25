import { keyFromFileUrl, storageClient } from "@backend/infrastructure/storage";
import { createLogger } from "@logger";

const authLogger = createLogger("auth");

/**
 * Best-effort cleanup after the user row is gone; failures are logged, never
 * surfaced. The polar plugin deletes the Polar customer.
 */
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
};
