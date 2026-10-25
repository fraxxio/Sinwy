import db from "@db";
import { memberHasRole } from "@db/memberRole";
import {
	member,
	organization,
	organizationTransfer,
} from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import type { OpenTransferStatus, PlanSlug } from "@sinwy/shared";
import {
	and,
	asc,
	eq,
	exists,
	gt,
	inArray,
	isNull,
	lte,
	not,
	sql,
} from "drizzle-orm";
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
			status: organization.status,
			subscriptionId: organization.subscriptionId,
			deletionScheduledAt: organization.deletionScheduledAt,
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

export const moveOwnership = (
	organizationId: string,
	fromUserId: string,
	toUserId: string,
) =>
	db.transaction((tx) => swapOwner(tx, organizationId, fromUserId, toUserId));

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

export const hasOpenTransfer = async (organizationId: string) => {
	const [row] = await db
		.select({ id: organizationTransfer.id })
		.from(organizationTransfer)
		.where(
			and(eq(organizationTransfer.organizationId, organizationId), isOpen),
		);
	return row !== undefined;
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
			plan: organization.plan,
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

/**
 * Records the checkout opened on acceptance, unless another acceptance stored
 * one since `previousCheckoutId` was read; false then.
 */
export const markAccepted = async (
	id: string,
	previousCheckoutId: string | null,
	checkoutId: string,
) => {
	const updated = await db
		.update(organizationTransfer)
		.set({ status: "accepted", checkoutId, updatedAt: sql`now()` })
		.where(
			and(
				eq(organizationTransfer.id, id),
				isOpen,
				previousCheckoutId === null
					? isNull(organizationTransfer.checkoutId)
					: eq(organizationTransfer.checkoutId, previousCheckoutId),
			),
		)
		.returning({ id: organizationTransfer.id });
	return updated.length > 0;
};

export type TransferCompletion =
	| {
			result: "completed";
			transfer: TransferRow;
			oldSubscriptionId: string | null;
	  }
	| { result: "not-accepted" }
	| { result: "refused"; reason: string };

/**
 * Hands the organization to the recipient in one transaction: roles swap and
 * the organization is rebound to the recipient's subscription. The only write
 * that replaces a bound subscription with another. A transfer whose recipient
 * left, whose owner changed, or whose organization is scheduled for deletion
 * is canceled instead.
 */
export const completeTransfer = (
	transferId: string,
	subscriptionId: string,
	plan: PlanSlug | null,
	observedAt: Date,
) =>
	db.transaction(async (tx): Promise<TransferCompletion> => {
		const [unlocked] = await tx
			.select({ organizationId: organizationTransfer.organizationId })
			.from(organizationTransfer)
			.where(eq(organizationTransfer.id, transferId));
		if (!unlocked) return { result: "not-accepted" };

		// organization first, the same order as every other subscription write
		const [org] = await tx
			.select({
				subscriptionId: organization.subscriptionId,
				deletionScheduledAt: organization.deletionScheduledAt,
			})
			.from(organization)
			.where(eq(organization.id, unlocked.organizationId))
			.for("update");
		const [transfer] = await tx
			.select()
			.from(organizationTransfer)
			.where(eq(organizationTransfer.id, transferId))
			.for("update");
		if (!org || transfer?.status !== "accepted")
			return { result: "not-accepted" };

		const refuse = async (reason: string): Promise<TransferCompletion> => {
			await tx
				.update(organizationTransfer)
				.set({ status: "canceled", updatedAt: sql`now()` })
				.where(eq(organizationTransfer.id, transferId));
			return { result: "refused", reason };
		};
		if (org.deletionScheduledAt) return refuse("scheduled-for-deletion");
		const swap = await swapOwner(
			tx,
			transfer.organizationId,
			transfer.fromUserId,
			transfer.toUserId,
		);
		if (swap.result !== "swapped") return refuse(swap.result);

		await tx
			.update(organization)
			.set({
				status: "active",
				plan,
				subscriptionId,
				subscriptionStatusAt: observedAt,
			})
			.where(eq(organization.id, transfer.organizationId));
		const [completed] = await tx
			.update(organizationTransfer)
			.set({
				status: "completed",
				oldSubscriptionId: org.subscriptionId,
				newSubscriptionId: subscriptionId,
				updatedAt: sql`now()`,
			})
			.where(eq(organizationTransfer.id, transferId))
			.returning();
		if (!completed) throw new Error("Locked transfer row disappeared");
		return {
			result: "completed",
			transfer: completed,
			oldSubscriptionId: org.subscriptionId,
		};
	});

export const markTransferSettled = (id: string) =>
	db
		.update(organizationTransfer)
		.set({ settledAt: sql`now()`, updatedAt: sql`now()` })
		.where(eq(organizationTransfer.id, id));

export const findUserContacts = (userIds: string[]) =>
	db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(inArray(user.id, userIds));
