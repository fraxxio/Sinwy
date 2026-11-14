import { rollupAnalyticsJob } from "@analyticsModule";
import { cancelUpcomingOrganizationBookings } from "@bookingsModule";
import { purgeNotificationsJob } from "@notificationsModule";
import {
	createPurgeOrganizationsJob,
	purgeActivityJob,
} from "@organizationsModule";
import { expireTransfersJob } from "@transfersModule";

/** Organizations can't import bookings, so the purge's repair cancels bookings through this wiring. */
export const purgeOrganizationsJob = createPurgeOrganizationsJob({
	onScheduled: (organizationIds) =>
		cancelUpcomingOrganizationBookings(organizationIds),
});

export const jobs = [
	purgeOrganizationsJob,
	expireTransfersJob,
	rollupAnalyticsJob,
	purgeActivityJob,
	purgeNotificationsJob,
];
