import db from "@db";
import { memberHasRole } from "@db/memberRole";
import { member, organization } from "@db/schema/organizationSchema";
import { and, asc, eq, isNull } from "drizzle-orm";

/**
 * Oldest organization the user owns that billing has not activated yet.
 * Single index hit on member_userId_idx, then a primary-key join, this runs
 * on every app load, so it must stay a bounded lookup.
 */
export const findUnpaidOwnedOrganization = async (userId: string) => {
	const [row] = await db
		.select({ organizationId: organization.id })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(
				eq(member.userId, userId),
				memberHasRole("owner"),
				eq(organization.status, "inactive"),
			),
		)
		.orderBy(asc(organization.createdAt))
		.limit(1);
	return row?.organizationId ?? null;
};

/** Oldest paid organization the user owns that never finished its setup wizard. */
export const findUnfinishedOnboardingOrganization = async (userId: string) => {
	const [row] = await db
		.select({ organizationId: organization.id })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(
				eq(member.userId, userId),
				memberHasRole("owner"),
				eq(organization.status, "active"),
				isNull(organization.onboardingCompletedAt),
			),
		)
		.orderBy(asc(organization.createdAt))
		.limit(1);
	return row?.organizationId ?? null;
};
