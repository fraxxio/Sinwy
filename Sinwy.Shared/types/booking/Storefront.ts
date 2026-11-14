import type { OrganizationProfileDto } from "../organization/OrganizationProfile";
import type { PublicServiceDto } from "../service/Service";

/** An active organization's booking page: its public details and the services it takes bookings for. */
export type StorefrontDto = {
	organization: Pick<
		OrganizationProfileDto,
		"tagline" | "description" | "city" | "country"
	> & {
		name: string;
		slug: string;
		logo: string | null;
		timezone: string;
		currency: string;
	};
	services: PublicServiceDto[];
};
