import db from "@db";
import { memberHasRole } from "@db/memberRole";
import { member, organization } from "@db/schema/organizationSchema";
import { userSubscription } from "@db/schema/userSchema";
import { PLAN_ORGANIZATION_LIMITS, toPlanSlug } from "@sinwy/shared";
import { and, count, eq, exists, isNotNull, isNull, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

/**
 * Locks the user's plan row, which serializes every write that hands out one
 * of their slots, and returns the plan while it grants access.
 */
export const lockPlan = async (tx: Tx, userId: string) => {
	const [row] = await tx
		.select({ plan: userSubscription.plan })
		.from(userSubscription)
		.where(eq(userSubscription.userId, userId))
		.for("update");
	return row?.plan ?? null;
};

/** Slots in use: owned organizations holding one, not scheduled for deletion. */
export const countHeldSlots = async (
	executor: Tx | typeof db,
	userId: string,
) => {
	const [row] = await executor
		.select({ held: count() })
		.from(organization)
		.where(
			and(
				isNotNull(organization.slotHeldAt),
				isNull(organization.deletionScheduledAt),
				ownedBy(userId),
			),
		);
	return row?.held ?? 0;
};

/** Organizations the plan keeps active at once; none without a plan. */
export const slotLimit = (plan: string | null) => {
	const slug = toPlanSlug(plan);
	return slug ? PLAN_ORGANIZATION_LIMITS[slug] : 0;
};
