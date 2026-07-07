import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { eq } from "drizzle-orm";

/**
 * `organization.status` is the additional field this module defines on the
 * organization plugin (auth.ts); the billing projection writes it directly
 * by design (docs/technical-plan.md §1.5). Going through the organizations
 * service instead would make auth ↔ organizations circular.
 */
export const setOrganizationStatus = async (
	organizationId: string,
	status: string,
) => {
	await db
		.update(organization)
		.set({ status })
		.where(eq(organization.id, organizationId));
};
