import db from "@db";
import { memberHasRole } from "@db/memberRole";
import { member, organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { and, eq, inArray } from "drizzle-orm";

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
