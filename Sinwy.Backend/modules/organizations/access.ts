import db from "@db";
import { memberHasRole } from "@db/memberRole";
import { session } from "@db/schema/authSchema";
import { member, organization } from "@db/schema/organizationSchema";
import { userSubscription } from "@db/schema/userSchema";
import { and, eq, exists, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// correlated on the outer query's `organization`
const ofOwner = <T>(column: AnyPgColumn) =>
	sql<T>`(${db
		.select({ value: column })
		.from(member)
		.innerJoin(userSubscription, eq(userSubscription.userId, member.userId))
		.where(
			and(eq(member.organizationId, organization.id), memberHasRole("owner")),
		)})`;

/**
 * Select fields that decide whether an organization is active; spread into a
 * query on `organization`. See `isOrganizationPublic`.
 */
export const organizationAccess = {
	slotHeldAt: organization.slotHeldAt,
	deletionScheduledAt: organization.deletionScheduledAt,
	/** The owner's plan while it grants access, else null. */
	ownerPlan: ofOwner<string | null>(userSubscription.plan),
	/** Polar's status of the owner's subscription; null without one. */
	ownerSubscriptionStatus: ofOwner<string | null>(userSubscription.status),
};

export type OrganizationAccess = {
	slotHeldAt: Date | null;
	deletionScheduledAt: Date | null;
	ownerPlan: string | null;
	ownerSubscriptionStatus: string | null;
};

export const ownedBy = (userId: string) =>
	exists(
		db
			.select({ id: member.id })
			.from(member)
			.where(
				and(
					eq(member.organizationId, organization.id),
					eq(member.userId, userId),
					memberHasRole("owner"),
				),
			),
	);

/** Takes the organizations out of every session that has them active. */
export const clearFromSessions = async (
	executor: Tx | typeof db,
	organizationIds: string[],
) => {
	if (organizationIds.length === 0) return;
	await executor
		.update(session)
		.set({ activeOrganizationId: null })
		.where(inArray(session.activeOrganizationId, organizationIds));
};
