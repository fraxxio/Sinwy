import { auth } from "@authModule";
import { uniqueSlug } from "@backend/modules/organizations/utils";
import type { OrganizationDto, OrganizationStatus } from "@sinwy/shared";
import { findStatusForMember, isSlugTaken } from "./repository";

export const createOrganization = async (
	userId: string,
	name: string,
): Promise<OrganizationDto> => {
	const slug = await uniqueSlug(name, isSlugTaken);
	// server-side system action: no session headers + explicit userId bypasses
	// allowUserToCreateOrganization: false; creator becomes owner
	const org = await auth.api.createOrganization({
		body: { name, slug, userId },
	});
	if (!org) throw new Error("Organization creation failed");
	return {
		id: org.id,
		name: org.name,
		slug: org.slug,
		// DB column is a plain string; only the webhook projection writes it, with these two values
		status: org.status as OrganizationStatus,
	};
};

export const getOrganizationStatus = async (
	userId: string,
	organizationId: string,
) => {
	// null → org doesn't exist or caller isn't a member (both read as not-found)
	return findStatusForMember(userId, organizationId);
};
