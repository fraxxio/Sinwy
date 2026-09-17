import { keyFromFileUrl, storageClient } from "@backend/infrastructure/storage";
import { createLogger } from "@logger";
import { polarClient } from "./polarClient";

const authLogger = createLogger("auth");

/**
 * Polar deletes a customer together with every subscription it pays for.
 * A subscription for an organization that survived the delete cascade
 * (another owner remains) must keep billing, so the customer stays too.
 */
const deletePolarCustomer = async (userId: string) => {
	const active = await polarClient.subscriptions.list({
		externalCustomerId: userId,
		active: true,
		limit: 1,
	});
	if (active.result.items.length > 0) {
		authLogger.info(
			"Kept Polar customer of deleted user: active subscription",
			{
				userId,
			},
		);
		return;
	}
	await polarClient.customers.deleteExternal({ externalId: userId });
};

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
			error,
		});
	}
};
