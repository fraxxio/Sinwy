import db from "@db";
import { member, organization } from "@db/schema/organizationSchema";
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
