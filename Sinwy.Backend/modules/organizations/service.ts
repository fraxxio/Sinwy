import { auth, polarClient } from "@authModule";
import { uniqueSlug } from "@backend/modules/organizations/utils";
import type {
	OrganizationDto,
	OrganizationIndustry,
	OrganizationStatus,
} from "@sinwy/shared";
import { reconcileInactiveStatus } from "./reconcileStatus";
import { findStatusForMember, isSlugTaken, setStatus } from "./repository";

export const createOrganization = async (
	userId: string,
	name: string,
	industry: OrganizationIndustry,
): Promise<OrganizationDto> => {
	const slug = await uniqueSlug(name, isSlugTaken);
	// server-side system action: no session headers + explicit userId bypasses
	// allowUserToCreateOrganization: false; creator becomes owner
	const org = await auth.api.createOrganization({
		body: { name, slug, userId, industry },
	});
	if (!org) throw new Error("Organization creation failed");
	return {
		id: org.id,
		name: org.name,
		slug: org.slug,
		// DB column is a plain string; only the webhook projection writes it, with these two values
		status: org.status as OrganizationStatus,
		industry: org.industry as OrganizationIndustry,
	};
};

export const getOrganizationStatus = async (
	userId: string,
	organizationId: string,
): Promise<OrganizationStatus | null> => {
	// null → org doesn't exist or caller isn't a member (both read as not-found)
	const status = await findStatusForMember(userId, organizationId);
	if (status === null) return null;
	if (status === "active") return "active";
	return reconcileInactiveStatus(organizationId);
};

/** Billing projection entry point: Polar subscription state → organization. */
export const setOrganizationStatus = (
	organizationId: string,
	status: OrganizationStatus,
) => setStatus(organizationId, status);

export const getCheckoutOrganization = async (
	userId: string,
	checkoutId: string,
) => {
	// null → unknown checkout, someone else's checkout, or no org reference
	const checkout = await polarClient.checkouts
		.get({ id: checkoutId })
		.catch(() => null);
	if (!checkout || checkout.externalCustomerId !== userId) return null;
	const referenceId = checkout.metadata["referenceId"];
	return typeof referenceId === "string"
		? { organizationId: referenceId }
		: null;
};
