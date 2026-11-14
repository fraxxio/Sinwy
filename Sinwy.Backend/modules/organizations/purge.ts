import type { Job } from "@backend/lib/jobs";
import { createLogger } from "@logger";
import {
	deleteOrganizations,
	findExpiredOrganizations,
	findOwnerlessUnscheduledOrganizations,
	scheduleOrganizationsForDeletion,
	unscheduleOwnedOrganizations,
} from "./repository";
import { deleteStoredLogo, RETENTION_MS } from "./service";

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

export type PurgeHooks = {
	/** Runs once the repair has scheduled ownerless organizations, as the account deletion would have. */
	onScheduled?: (organizationIds: string[]) => Promise<unknown>;
};

/** Its owner is gone, but the account deletion never marked it. */
const scheduleOwnerless = async (now: Date, hooks: PurgeHooks) => {
	const orgs = await findOwnerlessUnscheduledOrganizations(
		new Date(now.getTime() - IN_FLIGHT_MS),
	);
	if (orgs.length === 0) return 0;
	const ids = orgs.map((org) => org.id);
	await scheduleOrganizationsForDeletion(ids, now);
	await hooks.onScheduled?.(ids);
	for (const { id } of orgs)
		purgeLogger.warn("Scheduled the deletion of an org without an owner", {
			organizationId: id,
		});
	return orgs.length;
};

const purgeExpired = async (now: Date) => {
	const cutoff = new Date(now.getTime() - RETENTION_MS);
	let purged = 0;
	for (;;) {
		const batch = await findExpiredOrganizations(cutoff, BATCH_SIZE);
		if (batch.length === 0) break;
		await deleteOrganizations(batch.map((org) => org.id));
		for (const org of batch) await deleteStoredLogo(org.id, org.logo);
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
export const purgeScheduledOrganizations = async (
	now = new Date(),
	hooks: PurgeHooks = {},
) => ({
	unscheduled: await unscheduleOwned(now),
	scheduled: await scheduleOwnerless(now, hooks),
	purged: await purgeExpired(now),
});

export const createPurgeOrganizationsJob = (
	hooks: PurgeHooks,
): Job<Awaited<ReturnType<typeof purgeScheduledOrganizations>>> => ({
	name: "purge-scheduled-organizations",
	intervalMs: 60 * 60 * 1000,
	run: () => purgeScheduledOrganizations(new Date(), hooks),
});
