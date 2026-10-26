import db from "@db";
import { memberHasRole } from "@db/memberRole";
import { member, organization } from "@db/schema/organizationSchema";
import { userSubscription } from "@db/schema/userSchema";
import { PLAN_ORGANIZATION_LIMITS, toPlanSlug } from "@sinwy/shared";
import { and, asc, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { clearFromSessions, ownedBy, type Tx } from "./access";

// Every write to a slot or to ownership lives here. Each locks the plan rows
// first, by user id, then the organization rows.

/**
 * Locks the user's plan row, which serializes every write that hands out one
 * of their slots. `plan` is set while it grants access; `paused` while the
 * subscription is bound but suspended.
 */
const lockPlan = async (tx: Tx, userId: string) => {
	const [row] = await tx
		.select({
			plan: userSubscription.plan,
			status: userSubscription.status,
			subscriptionId: userSubscription.subscriptionId,
		})
		.from(userSubscription)
		.where(eq(userSubscription.userId, userId))
		.for("update");
	return {
		plan: row?.plan ?? null,
		paused: row?.status === "paused" && row.subscriptionId !== null,
	};
};

/** Organizations the plan keeps active at once; none without a plan. */
export const slotLimit = (plan: string | null) => {
	const slug = toPlanSlug(plan);
	return slug ? PLAN_ORGANIZATION_LIMITS[slug] : 0;
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
 * Brings the user's held slots within `limit`; the caller holds the user's
 * plan row locked. What loses its slot leaves the sessions that have it open.
 * Returns the user's picks and the rest the cap forced.
 */
export const fitSlotsToCap = async (
	tx: Tx,
	userId: string,
	limit: number,
	releaseFirst: readonly string[],
) => {
	const held = await listHeldSlots(tx, userId).for("update");
	const released = slotsOverLimit(held, limit, releaseFirst);
	const ids = [...released.picked, ...released.unpicked].map(({ id }) => id);
	if (ids.length > 0) {
		await tx
			.update(organization)
			.set({ slotHeldAt: null })
			.where(inArray(organization.id, ids));
		await clearFromSessions(tx, ids);
	}
	return released;
};

export type SlotHold =
	| { result: "held" }
	| { result: "not-found" }
	| { result: "no-plan" }
	| { result: "limit-reached"; limit: number };

/**
 * Gives an organization the owner owns one of their slots. The owner's plan
 * row is locked first, so concurrent activations count one after another.
 */
export const holdSlot = (userId: string, organizationId: string) =>
	db.transaction(async (tx): Promise<SlotHold> => {
		const { plan } = await lockPlan(tx, userId);
		const [org] = await tx
			.select({ slotHeldAt: organization.slotHeldAt })
			.from(organization)
			.where(
				and(
					eq(organization.id, organizationId),
					isNull(organization.deletionScheduledAt),
					ownedBy(userId),
				),
			)
			.for("update");
		if (!org) return { result: "not-found" };
		if (org.slotHeldAt) return { result: "held" };
		if (!plan) return { result: "no-plan" };

		const limit = slotLimit(plan);
		if ((await countHeldSlots(tx, userId)) >= limit)
			return { result: "limit-reached", limit };
		await tx
			.update(organization)
			.set({ slotHeldAt: new Date() })
			.where(eq(organization.id, organizationId));
		return { result: "held" };
	});

/**
 * Frees the organization's slot and takes it out of the sessions that have it
 * open. false when the user doesn't own it or it is scheduled for deletion.
 */
export const releaseSlot = (userId: string, organizationId: string) =>
	db.transaction(async (tx) => {
		const released = await tx
			.update(organization)
			.set({ slotHeldAt: null })
			.where(
				and(
					eq(organization.id, organizationId),
					isNull(organization.deletionScheduledAt),
					ownedBy(userId),
				),
			)
			.returning({ id: organization.id });
		await clearFromSessions(
			tx,
			released.map(({ id }) => id),
		);
		return released.length > 0;
	});

/**
 * Locks what a handover changes: both owners' plan rows, then the
 * organization. Says whether the recipient has a plan that grants access,
 * a free slot on it, or a suspended one.
 */
export const lockHandover = async (
	tx: Tx,
	organizationId: string,
	fromUserId: string,
	toUserId: string,
) => {
	let recipient = { plan: null as string | null, paused: false };
	for (const userId of [fromUserId, toUserId].sort()) {
		const locked = await lockPlan(tx, userId);
		if (userId === toUserId) recipient = locked;
	}
	const [org] = await tx
		.select({ deletionScheduledAt: organization.deletionScheduledAt })
		.from(organization)
		.where(eq(organization.id, organizationId))
		.for("update");
	const recipientHasSlot =
		recipient.plan !== null &&
		(await countHeldSlots(tx, toUserId)) < slotLimit(recipient.plan);
	return {
		org: org ?? null,
		recipientHasPlan: recipient.plan !== null,
		recipientHasSlot,
		recipientSuspended: recipient.paused,
	};
};

export type OwnerSwap =
	| { result: "swapped" }
	| { result: "owner-changed" }
	| { result: "not-a-member" };

/**
 * Demotes `fromUserId` to admin, then promotes `toUserId` to owner, in that
 * order: the one-owner index never sees two owners. Both rows are locked
 * first, so the checks hold until the transaction commits.
 */
const swapOwner = async (
	tx: Tx,
	organizationId: string,
	fromUserId: string,
	toUserId: string,
): Promise<OwnerSwap> => {
	const rows = await tx
		.select({
			userId: member.userId,
			isOwner: memberHasRole("owner").mapWith(Boolean),
		})
		.from(member)
		.where(
			and(
				eq(member.organizationId, organizationId),
				inArray(member.userId, [fromUserId, toUserId]),
			),
		)
		.for("update");
	const from = rows.find((row) => row.userId === fromUserId);
	const to = rows.find((row) => row.userId === toUserId);
	if (!from?.isOwner) return { result: "owner-changed" };
	if (!to || fromUserId === toUserId) return { result: "not-a-member" };

	await tx
		.update(member)
		.set({ role: "admin" })
		.where(
			and(
				eq(member.organizationId, organizationId),
				eq(member.userId, fromUserId),
			),
		);
	await tx
		.update(member)
		.set({ role: "owner" })
		.where(
			and(
				eq(member.organizationId, organizationId),
				eq(member.userId, toUserId),
			),
		);
	return { result: "swapped" };
};

/**
 * Swaps the roles; the old owner's slot is freed, and the organization holds
 * one of the new owner's with `slotToRecipient`, or none. The caller holds
 * `lockHandover`.
 */
export const handOver = async (
	tx: Tx,
	organizationId: string,
	fromUserId: string,
	toUserId: string,
	slotToRecipient: boolean,
) => {
	const swap = await swapOwner(tx, organizationId, fromUserId, toUserId);
	if (swap.result === "swapped")
		await tx
			.update(organization)
			.set({ slotHeldAt: slotToRecipient ? new Date() : null })
			.where(eq(organization.id, organizationId));
	return swap;
};

export type SupportHandover =
	| { result: "swapped"; slotHeld: boolean }
	| { result: "owner-changed" }
	| { result: "not-a-member" }
	| { result: "not-found" };

/** Support path: roles swap, and the organization keeps a slot only if the recipient has one free. */
export const moveOwnership = (
	organizationId: string,
	fromUserId: string,
	toUserId: string,
) =>
	db.transaction(async (tx): Promise<SupportHandover> => {
		const { org, recipientHasSlot } = await lockHandover(
			tx,
			organizationId,
			fromUserId,
			toUserId,
		);
		if (!org) return { result: "not-found" };
		const swap = await handOver(
			tx,
			organizationId,
			fromUserId,
			toUserId,
			recipientHasSlot,
		);
		if (swap.result !== "swapped") return swap;
		return { result: "swapped", slotHeld: recipientHasSlot };
	});
