import db from "@db";
import { member, organization } from "@db/schema/organizationSchema";
import { and, eq } from "drizzle-orm";

/** Raw role column plus the organization's status; null when the user is not a member. */
export const findMembership = async (
	userId: string,
	organizationId: string,
) => {
	const [row] = await db
		.select({ role: member.role, status: organization.status })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
		);
	return row ?? null;
};
