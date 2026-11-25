import { rollupAnalyticsJob } from "@analyticsModule";
import { cancelUpcomingOrganizationBookings } from "@bookingsModule";
import { purgeNotificationsJob } from "@notificationsModule";
import {
	createPurgeOrganizationsJob,
	type PurgeHooks,
	purgeActivityJob,
} from "@organizationsModule";
import { deleteOrganizationPageImages, sweepPageImagesJob } from "@pagesModule";
import { expireTransfersJob } from "@transfersModule";

/** Organizations can't import bookings or pages, so the purge reaches them through this wiring. */
export const purgeHooks: PurgeHooks = {
	onScheduled: (organizationIds) =>
		cancelUpcomingOrganizationBookings(organizationIds),
	onPurged: deleteOrganizationPageImages,
};

export const purgeOrganizationsJob = createPurgeOrganizationsJob(purgeHooks);

export const jobs = [
	purgeOrganizationsJob,
	expireTransfersJob,
	rollupAnalyticsJob,
	purgeActivityJob,
	purgeNotificationsJob,
	sweepPageImagesJob,
];
