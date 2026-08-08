import db from "@db";
import { member, organization } from "@db/schema/organizationSchema";
import type { OrganizationStatus } from "@sinwy/shared";
import { and, eq } from "drizzle-orm";

export const isSlugTaken = async (slug: string) => {
	const [row] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slug));
	return row !== undefined;
};

export const findStatusForMember = async (
	userId: string,
	organizationId: string,
) => {
	const [row] = await db
		.select({ status: organization.status })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
		);
	return row?.status ?? null;
};

/** False when no row matched, i.e. the id belongs to no organization. */
export const setStatus = async (
	organizationId: string,
	status: OrganizationStatus,
) => {
	const updated = await db
		.update(organization)
		.set({ status })
		.where(eq(organization.id, organizationId))
		.returning({ id: organization.id });
	return updated.length > 0;
};
