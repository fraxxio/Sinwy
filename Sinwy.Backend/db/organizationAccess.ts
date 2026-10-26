import db from "@db";
import { memberHasRole } from "@db/memberRole";
import { member, organization } from "@db/schema/organizationSchema";
import { userSubscription } from "@db/schema/userSchema";
import { PLAN_ORGANIZATION_LIMITS, toPlanSlug } from "@sinwy/shared";
import {
	and,
	asc,
	count,
	eq,
	exists,
	inArray,
	isNotNull,
	isNull,
	sql,
} from "drizzle-orm";
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

const holdsSlot = (userId: string) =>
	and(
		isNotNull(organization.slotHeldAt),
		isNull(organization.deletionScheduledAt),
		ownedBy(userId),
	);

/** Slots in use: owned organizations holding one, not scheduled for deletion. */
export const countHeldSlots = async (
	executor: Tx | typeof db,
	userId: string,
) => {
	const [row] = await executor
		.select({ held: count() })
		.from(organization)
		.where(holdsSlot(userId));
	return row?.held ?? 0;
};

export type HeldSlot = { id: string; name: string };

/** Owned organizations holding a slot, earliest-activated first. */
export const listHeldSlots = (executor: Tx | typeof db, userId: string) =>
	executor
		.select({ id: organization.id, name: organization.name })
		.from(organization)
		.where(holdsSlot(userId))
		.orderBy(asc(organization.slotHeldAt), asc(organization.id));

/**
 * Which held slots a cap of `limit` takes away: the user's own picks first,
 * then, while still over the cap, the latest-activated ones (Default 9).
 */
export const slotsOverLimit = (
	held: HeldSlot[],
	limit: number,
	releaseFirst: readonly string[],
) => {
	const picked = held.filter((slot) => releaseFirst.includes(slot.id));
	const kept = held.filter((slot) => !releaseFirst.includes(slot.id));
	return { picked, unpicked: kept.slice(limit) };
};

/**
 * Brings the user's held slots within `limit`; the caller holds `lockPlan`.
 * Returns what lost its slot: the user's picks, and the rest the cap forced.
 */
export const releaseSlotsOverLimit = async (
	tx: Tx,
	userId: string,
	limit: number,
	releaseFirst: readonly string[],
) => {
	const held = await listHeldSlots(tx, userId).for("update");
	const released = slotsOverLimit(held, limit, releaseFirst);
	const ids = [...released.picked, ...released.unpicked].map(({ id }) => id);
	if (ids.length > 0)
		await tx
			.update(organization)
			.set({ slotHeldAt: null })
			.where(inArray(organization.id, ids));
	return released;
};

/** Organizations the plan keeps active at once; none without a plan. */
export const slotLimit = (plan: string | null) => {
	const slug = toPlanSlug(plan);
	return slug ? PLAN_ORGANIZATION_LIMITS[slug] : 0;
};
