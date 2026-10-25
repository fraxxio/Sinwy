import { keyFromFileUrl, storageClient } from "@backend/infrastructure/storage";
import type { Job } from "@backend/lib/jobs";
import { revokeOrganizationSubscription } from "@billingModule";
import { createLogger } from "@logger";
import {
	deleteOrganizations,
	findExpiredOrganizations,
	findOwnerlessUnscheduledOrganizations,
	scheduleOrganizationsForDeletion,
	unscheduleOwnedOrganizations,
} from "./repository";
import { RETENTION_MS } from "./service";

const purgeLogger = createLogger("organizations:purge");

const BATCH_SIZE = 100;
// an organization creation or account deletion may still be between its writes
const IN_FLIGHT_MS = 60 * 60 * 1000;

/** The account deletion marked it but never went through. */
const unscheduleOwned = async (now: Date) => {
	const orgs = await unscheduleOwnedOrganizations(
		new Date(now.getTime() - IN_FLIGHT_MS),
	);
	for (const { id } of orgs)
		purgeLogger.warn("Unscheduled the deletion of an org that has an owner", {
			organizationId: id,
		});
	return orgs.length;
};

/** Its owner is gone, but the account deletion never marked it. */
const scheduleOwnerless = async (now: Date) => {
	const orgs = await findOwnerlessUnscheduledOrganizations(
		new Date(now.getTime() - IN_FLIGHT_MS),
	);
	let scheduled = 0;
	for (const { id } of orgs) {
		// already logged; the next run tries again
		const revoked = await revokeOrganizationSubscription(id).then(
			() => true,
			() => false,
		);
		if (!revoked) continue;
		await scheduleOrganizationsForDeletion([id], now);
		purgeLogger.warn("Scheduled the deletion of an org without an owner", {
			organizationId: id,
		});
		scheduled++;
	}
	return scheduled;
};

const deleteLogo = async (org: { id: string; logo: string | null }) => {
	const key = keyFromFileUrl(org.logo);
	if (!key) return;
	await storageClient.delete(key).catch((error: unknown) => {
		purgeLogger.warn("Failed to delete logo of purged org", {
			organizationId: org.id,
			error,
		});
	});
};

const purgeExpired = async (now: Date) => {
	const cutoff = new Date(now.getTime() - RETENTION_MS);
	let purged = 0;
	for (;;) {
		const batch = await findExpiredOrganizations(cutoff, BATCH_SIZE);
		if (batch.length === 0) break;
		await deleteOrganizations(batch.map((org) => org.id));
		for (const org of batch) await deleteLogo(org);
		purged += batch.length;
		if (batch.length < BATCH_SIZE) break;
	}
	if (purged > 0) purgeLogger.info("Purged expired organizations", { purged });
	return purged;
};

/**
 * Hard-deletes organizations whose retention after their owner's account
 * deletion has run out, after repairing schedules a failed account deletion
 * left wrong. Safe to run again at any time.
 */
export const purgeScheduledOrganizations = async (now = new Date()) => ({
	unscheduled: await unscheduleOwned(now),
	scheduled: await scheduleOwnerless(now),
	purged: await purgeExpired(now),
});

export const purgeOrganizationsJob: Job<
	Awaited<ReturnType<typeof purgeScheduledOrganizations>>
> = {
	name: "purge-scheduled-organizations",
	intervalMs: 60 * 60 * 1000,
	run: () => purgeScheduledOrganizations(),
};
