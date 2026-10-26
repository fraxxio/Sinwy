import db from "@db";
import { memberHasRole } from "@db/memberRole";
import {
	countHeldSlots,
	lockPlan,
	organizationAccess,
	slotLimit,
} from "@db/organizationAccess";
import {
	member,
	organization,
	organizationTransfer,
} from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import type { OpenTransferStatus } from "@sinwy/shared";
import { and, asc, eq, exists, gt, inArray, lte, not, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type OwnerSwap =
	| { result: "swapped" }
	| { result: "owner-changed" }
	| { result: "not-a-member" };

/**
 * Demotes `fromUserId` to admin, then promotes `toUserId` to owner, in that
 * order: the one-owner index never sees two owners. Both rows are locked
 * first, so the checks hold until the transaction commits.
 */
export const swapOwner = async (
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

export const findOrganizationForTransfer = async (organizationId: string) => {
	const [row] = await db
		.select({
			id: organization.id,
			name: organization.name,
			...organizationAccess,
		})
		.from(organization)
		.where(eq(organization.id, organizationId));
	return row ?? null;
};

export const findMembers = (organizationId: string) =>
	db
		.select({
			userId: member.userId,
			role: member.role,
			name: user.name,
			email: user.email,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(eq(member.organizationId, organizationId));

/**
 * Locks what a handover changes, in the order every slot write takes it: both
 * owners' plan rows by id, then the organization. Says whether the recipient
 * has a plan that grants access, and a free slot on it.
 */
const lockForHandover = async (
	tx: Tx,
	organizationId: string,
	fromUserId: string,
	toUserId: string,
) => {
	let recipientPlan: string | null = null;
	for (const userId of [fromUserId, toUserId].sort()) {
		const plan = await lockPlan(tx, userId);
		if (userId === toUserId) recipientPlan = plan;
	}
	const [org] = await tx
		.select({ deletionScheduledAt: organization.deletionScheduledAt })
		.from(organization)
		.where(eq(organization.id, organizationId))
		.for("update");
	const recipientHasSlot =
		recipientPlan !== null &&
		(await countHeldSlots(tx, toUserId)) < slotLimit(recipientPlan);
	return {
		org: org ?? null,
		recipientHasPlan: recipientPlan !== null,
		recipientHasSlot,
	};
};

/** The old owner's slot is freed; the organization holds one of the new owner's, or none. */
const moveSlot = (tx: Tx, organizationId: string, toRecipient: boolean) =>
	tx
		.update(organization)
		.set({ slotHeldAt: toRecipient ? new Date() : null })
		.where(eq(organization.id, organizationId));

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
		const { org, recipientHasSlot } = await lockForHandover(
			tx,
			organizationId,
			fromUserId,
			toUserId,
		);
		if (!org) return { result: "not-found" };
		const swap = await swapOwner(tx, organizationId, fromUserId, toUserId);
		if (swap.result !== "swapped") return swap;
		await moveSlot(tx, organizationId, recipientHasSlot);
		return { result: "swapped", slotHeld: recipientHasSlot };
	});

export type TransferRow = typeof organizationTransfer.$inferSelect;

const OPEN_STATUSES: OpenTransferStatus[] = ["pending", "accepted"];
const isOpen = inArray(organizationTransfer.status, OPEN_STATUSES);

/** null when the organization already has an open transfer. */
export const insertTransfer = async (
	values: Pick<
		typeof organizationTransfer.$inferInsert,
		"id" | "organizationId" | "fromUserId" | "toUserId" | "expiresAt"
	>,
) => {
	const [row] = await db
		.insert(organizationTransfer)
		.values(values)
		.onConflictDoNothing()
		.returning();
	return row ?? null;
};

export const findTransfer = async (id: string) => {
	const [row] = await db
		.select()
		.from(organizationTransfer)
		.where(eq(organizationTransfer.id, id));
	return row ?? null;
};

/** The recipient's transfer waiting on their plan checkout. */
export const findAcceptedTransfer = async (
	id: string,
	toUserId: string,
	now: Date,
) => {
	const [row] = await db
		.select({ organizationId: organizationTransfer.organizationId })
		.from(organizationTransfer)
		.where(
			and(
				eq(organizationTransfer.id, id),
				eq(organizationTransfer.toUserId, toUserId),
				eq(organizationTransfer.status, "accepted"),
				gt(organizationTransfer.expiresAt, now),
			),
		);
	return row ?? null;
};

export const findOpenTransfer = async (organizationId: string) => {
	const [row] = await db
		.select({
			id: organizationTransfer.id,
			status: organizationTransfer.status,
			expiresAt: organizationTransfer.expiresAt,
			toUserId: organizationTransfer.toUserId,
			toName: user.name,
			toEmail: user.email,
		})
		.from(organizationTransfer)
		.innerJoin(user, eq(organizationTransfer.toUserId, user.id))
		.where(
			and(eq(organizationTransfer.organizationId, organizationId), isOpen),
		);
	return row ?? null;
};

const fromUser = alias(user, "from_user");

export const findIncomingTransfers = (userId: string, now: Date) =>
	db
		.select({
			id: organizationTransfer.id,
			status: organizationTransfer.status,
			expiresAt: organizationTransfer.expiresAt,
			organizationId: organization.id,
			organizationName: organization.name,
			fromName: fromUser.name,
			fromEmail: fromUser.email,
		})
		.from(organizationTransfer)
		.innerJoin(
			organization,
			eq(organizationTransfer.organizationId, organization.id),
		)
		.innerJoin(fromUser, eq(organizationTransfer.fromUserId, fromUser.id))
		.where(
			and(
				eq(organizationTransfer.toUserId, userId),
				isOpen,
				gt(organizationTransfer.expiresAt, now),
			),
		)
		.orderBy(asc(organizationTransfer.createdAt));

const close = (
	status: "declined" | "canceled" | "expired",
	where: ReturnType<typeof and>,
) =>
	db
		.update(organizationTransfer)
		.set({ status, updatedAt: sql`now()` })
		.where(and(isOpen, where))
		.returning({
			id: organizationTransfer.id,
			organizationId: organizationTransfer.organizationId,
		});

export const cancelOpenTransfer = (organizationId: string) =>
	close("canceled", eq(organizationTransfer.organizationId, organizationId));

export const declineTransfer = (id: string, toUserId: string) =>
	close(
		"declined",
		and(
			eq(organizationTransfer.id, id),
			eq(organizationTransfer.toUserId, toUserId),
		),
	);

/** Open transfers to `userId` once they are no longer a member of the organization. */
export const cancelTransfersToFormerMember = (
	organizationId: string,
	userId: string,
) =>
	close(
		"canceled",
		and(
			eq(organizationTransfer.organizationId, organizationId),
			eq(organizationTransfer.toUserId, userId),
			not(
				exists(
					db
						.select({ id: member.id })
						.from(member)
						.where(
							and(
								eq(member.organizationId, organizationId),
								eq(member.userId, userId),
							),
						),
				),
			),
		),
	);

export const expireTransfers = (now: Date, organizationId?: string) =>
	close(
		"expired",
		and(
			lte(organizationTransfer.expiresAt, now),
			organizationId
				? eq(organizationTransfer.organizationId, organizationId)
				: undefined,
		),
	);

export type TransferCompletion =
	| { result: "completed"; transfer: TransferRow }
	| { result: "not-open" }
	| { result: "needs-plan" }
	| { result: "needs-slot" }
	| { result: "refused"; reason: string };

/**
 * Hands the organization to the recipient in one transaction: roles swap and
 * the organization moves from the old owner's slot to one of the recipient's.
 * Refused, leaving the offer open, while the recipient has no plan that grants
 * access or no free slot; a recipient without a plan leaves it `accepted`,
 * waiting on their checkout. A transfer whose recipient left or whose owner
 * changed is canceled instead. `acceptedOnly` completes only a transfer
 * already waiting on a checkout.
 */
export const completeTransfer = (
	transferId: string,
	now: Date,
	{ acceptedOnly = false } = {},
) =>
	db.transaction(async (tx): Promise<TransferCompletion> => {
		const [unlocked] = await tx
			.select()
			.from(organizationTransfer)
			.where(eq(organizationTransfer.id, transferId));
		if (!unlocked) return { result: "not-open" };

		const { org, recipientHasPlan, recipientHasSlot } = await lockForHandover(
			tx,
			unlocked.organizationId,
			unlocked.fromUserId,
			unlocked.toUserId,
		);
		const [transfer] = await tx
			.select()
			.from(organizationTransfer)
			.where(
				and(
					eq(organizationTransfer.id, transferId),
					acceptedOnly ? eq(organizationTransfer.status, "accepted") : isOpen,
				),
			)
			.for("update");
		if (
			!org ||
			org.deletionScheduledAt ||
			!transfer ||
			transfer.expiresAt <= now
		)
			return { result: "not-open" };
		if (!recipientHasPlan) {
			await tx
				.update(organizationTransfer)
				.set({ status: "accepted", updatedAt: sql`now()` })
				.where(eq(organizationTransfer.id, transferId));
			return { result: "needs-plan" };
		}
		if (!recipientHasSlot) return { result: "needs-slot" };

		const swap = await swapOwner(
			tx,
			transfer.organizationId,
			transfer.fromUserId,
			transfer.toUserId,
		);
		if (swap.result !== "swapped") {
			await tx
				.update(organizationTransfer)
				.set({ status: "canceled", updatedAt: sql`now()` })
				.where(eq(organizationTransfer.id, transferId));
			return { result: "refused", reason: swap.result };
		}
		await moveSlot(tx, transfer.organizationId, true);
		const [completed] = await tx
			.update(organizationTransfer)
			.set({ status: "completed", updatedAt: sql`now()` })
			.where(eq(organizationTransfer.id, transferId))
			.returning();
		if (!completed) throw new Error("Locked transfer row disappeared");
		return { result: "completed", transfer: completed };
	});

export const findUserContacts = (userIds: string[]) =>
	db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(inArray(user.id, userIds));
