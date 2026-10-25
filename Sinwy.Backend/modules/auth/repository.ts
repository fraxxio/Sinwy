import db from "@db";
import { organizationAccess } from "@db/organizationAccess";
import { session } from "@db/schema/authSchema";
import { member, organization } from "@db/schema/organizationSchema";
import { and, eq } from "drizzle-orm";

/** Raw role column plus the organization's access; null when the user is not a member. */
export const findMembership = async (
	userId: string,
	organizationId: string,
) => {
	const [row] = await db
		.select({ role: member.role, ...organizationAccess })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
		);
	return row ?? null;
};

/** The organization, by id or slug, if the user is a member of it. */
export const findMemberOrganization = async (
	userId: string,
	ref: { id: string } | { slug: string },
) => {
	const [row] = await db
		.select(organizationAccess)
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(
				eq(member.userId, userId),
				"id" in ref
					? eq(organization.id, ref.id)
					: eq(organization.slug, ref.slug),
			),
		);
	return row ?? null;
};

export const clearActiveOrganizationFromSessions = (organizationId: string) =>
	db
		.update(session)
		.set({ activeOrganizationId: null })
		.where(eq(session.activeOrganizationId, organizationId));
