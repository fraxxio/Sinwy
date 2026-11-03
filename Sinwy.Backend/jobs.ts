import { cancelUpcomingOrganizationBookings } from "@bookingsModule";
import { createPurgeOrganizationsJob } from "@organizationsModule";
import { expireTransfersJob } from "@transfersModule";

/** Organizations can't import bookings, so the purge's repair cancels bookings through this wiring. */
export const purgeOrganizationsJob = createPurgeOrganizationsJob({
	onScheduled: (organizationIds) =>
		cancelUpcomingOrganizationBookings(organizationIds),
});

export const jobs = [purgeOrganizationsJob, expireTransfersJob];
