import type { Job } from "@backend/lib/jobs";
import { createLogger } from "@logger";
import { expireTransfers } from "./repository";

const expiryLogger = createLogger("transfers:expiry");

/** A payment for an expired transfer that lands later is refunded in full. */
export const expireTransfersJob: Job<number> = {
	name: "expire-organization-transfers",
	intervalMs: 15 * 60 * 1000,
	run: async () => {
		const expired = await expireTransfers(new Date());
		if (expired.length > 0)
			expiryLogger.info("Expired ownership transfers", {
				expired: expired.length,
			});
		return expired.length;
	},
};
