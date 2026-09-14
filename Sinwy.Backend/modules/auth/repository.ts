import db from "@db";
import { member } from "@db/schema/organizationSchema";
import { and, eq } from "drizzle-orm";

/** Raw role column of the membership; null when the user is not a member. */
export const findMemberRole = async (
	userId: string,
	organizationId: string,
) => {
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
		);
	return row?.role ?? null;
};
