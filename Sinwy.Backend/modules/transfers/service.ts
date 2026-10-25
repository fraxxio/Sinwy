import { type Membership, resolveMembership } from "@authModule";
import { emailClient } from "@backend/infrastructure/email";
import appConfig from "@config";
import { createLogger } from "@logger";
import { isSuspended, organizationStatusOf } from "@organizationsModule";
import {
	type IncomingTransferDto,
	type OpenTransferStatus,
	type OrganizationTransferDto,
	parseMemberRoles,
	TRANSFER_OFFER_DAYS,
	toPlanSlug,
} from "@sinwy/shared";
import {
	TransferCompletedNewOwnerEmail,
	TransferCompletedOldOwnerEmail,
	TransferOfferEmail,
} from "./emails/transferEmails";
import {
	cancelOpenTransfer,
	cancelTransfersToFormerMember,
	completeTransfer,
	declineTransfer,
	expireTransfers,
	findIncomingTransfers,
	findMembers,
	findOpenTransfer,
	findOrganizationForTransfer,
	findTransfer,
	findUserContacts,
	insertTransfer,
	moveOwnership,
	type TransferRow,
} from "./repository";

const transferLogger = createLogger("transfers");

const OFFER_MS = TRANSFER_OFFER_DAYS * 24 * 60 * 60 * 1000;

export type SupportTransferResult =
	| { ok: false; error: string }
	| {
			ok: true;
			applied: boolean;
			organization: { id: string; name: string };
			from: { userId: string; email: string };
			to: { userId: string; email: string };
			/** Whether the organization holds one of the new owner's slots; known once applied. */
			slotHeld?: boolean;
	  };

/**
 * Support path for moving an organization to another member: the roles swap
 * and the organization takes one of the new owner's slots if they have one
 * free, otherwise it stays inactive until they activate it. No money moves.
 * Reads only, unless `apply`.
 */
export const transferOwnershipBySupport = async ({
	organizationId,
	toUserId,
	apply,
}: {
	organizationId: string;
	toUserId: string;
	apply: boolean;
}): Promise<SupportTransferResult> => {
	const org = await findOrganizationForTransfer(organizationId);
	if (!org) return { ok: false, error: "Unknown organization" };
	if (org.deletionScheduledAt)
		return { ok: false, error: "The organization is scheduled for deletion" };

	const members = await findMembers(organizationId);
	const owner = members.find((row) =>
		parseMemberRoles(row.role).includes("owner"),
	);
	const target = members.find((row) => row.userId === toUserId);
	if (!owner) return { ok: false, error: "The organization has no owner" };
	if (!target)
		return {
			ok: false,
			error: "The target is not a member of the organization",
		};
	if (target.userId === owner.userId)
		return { ok: false, error: "The target already owns the organization" };

	const report = {
		organization: { id: org.id, name: org.name },
		from: { userId: owner.userId, email: owner.email },
		to: { userId: target.userId, email: target.email },
	};
	if (!apply) return { ok: true, applied: false, ...report };

	const swap = await moveOwnership(organizationId, owner.userId, toUserId);
	if (swap.result !== "swapped")
		return { ok: false, error: `Roles not swapped: ${swap.result}` };
	// an in-app offer made by the previous owner no longer applies
	await cancelOpenTransfer(organizationId);
	return { ok: true, applied: true, ...report, slotHeld: swap.slotHeld };
};

/** Email failures never undo a transfer step; they are logged instead. */
const sendLogged = async (send: () => Promise<void>, context: object) => {
	try {
		await send();
	} catch (error) {
		transferLogger.error("Transfer email failed", { ...context, error });
	}
};

type Result<T, E> = { ok: true; data: T } | { ok: false; error: E };

const toOpenStatus = (status: string): OpenTransferStatus =>
	status === "accepted" ? "accepted" : "pending";

export const getOpenTransfer = async (
	membership: Membership,
	now = new Date(),
): Promise<OrganizationTransferDto | null> => {
	const row = await findOpenTransfer(membership.organizationId);
	if (!row || row.expiresAt <= now) return null;
	return {
		id: row.id,
		status: toOpenStatus(row.status),
		expiresAt: row.expiresAt.toISOString(),
		to: { userId: row.toUserId, name: row.toName, email: row.toEmail },
	};
};

export type OfferError =
	| "self"
	| "not-a-member"
	| "transfer-pending"
	| "not-found"
	| "inactive"
	| "suspended";

/** Only an active organization can be offered; a suspended one resumes first. */
const findOfferBlocker = async (organizationId: string) => {
	const org = await findOrganizationForTransfer(organizationId);
	if (!org) return "not-found" as const;
	if (isSuspended(org)) return "suspended" as const;
	if (organizationStatusOf(org) !== "active") return "inactive" as const;
	return null;
};

/** The owner offers the organization to another member; it stays theirs until the recipient accepts. */
export const offerTransfer = async (
	membership: Membership,
	fromUserId: string,
	toUserId: string,
	now = new Date(),
): Promise<Result<OrganizationTransferDto, OfferError>> => {
	const { organizationId } = membership;
	if (fromUserId === toUserId) return { ok: false, error: "self" };
	const members = await findMembers(organizationId);
	const from = members.find((row) => row.userId === fromUserId);
	const to = members.find((row) => row.userId === toUserId);
	if (!to) return { ok: false, error: "not-a-member" };

	const blocker = await findOfferBlocker(organizationId);
	if (blocker) return { ok: false, error: blocker };

	// a lapsed offer must not hold the one open slot until the job runs
	await expireTransfers(now, organizationId);
	const row = await insertTransfer({
		id: crypto.randomUUID(),
		organizationId,
		fromUserId,
		toUserId,
		expiresAt: new Date(now.getTime() + OFFER_MS),
	});
	if (!row) return { ok: false, error: "transfer-pending" };

	const org = await findOrganizationForTransfer(organizationId);
	await sendLogged(
		() =>
			emailClient.send({
				to: to.email,
				template: TransferOfferEmail,
				props: {
					organizationName: org?.name ?? "",
					fromName: from?.name ?? "",
					acceptUrl: new URL(
						"/account/organizations",
						appConfig.WEB_APP_URL,
					).toString(),
				},
			}),
		{ transferId: row.id },
	);
	transferLogger.info("Transfer offered", {
		transferId: row.id,
		organizationId,
	});
	return {
		ok: true,
		data: {
			id: row.id,
			status: "pending",
			expiresAt: row.expiresAt.toISOString(),
			to: { userId: to.userId, name: to.name, email: to.email },
		},
	};
};

/** True when there was an open transfer to cancel. */
export const cancelTransfer = async (membership: Membership) =>
	(await cancelOpenTransfer(membership.organizationId)).length > 0;

export const listIncomingTransfers = async (
	userId: string,
	now = new Date(),
): Promise<IncomingTransferDto[]> =>
	(await findIncomingTransfers(userId, now)).map((row) => ({
		id: row.id,
		status: toOpenStatus(row.status),
		expiresAt: row.expiresAt.toISOString(),
		organization: {
			id: row.organizationId,
			name: row.organizationName,
			plan: toPlanSlug(row.plan),
		},
		from: { name: row.fromName, email: row.fromEmail },
	}));

/** True when there was an open transfer to the user to decline. */
export const declineIncomingTransfer = async (
	userId: string,
	transferId: string,
) => (await declineTransfer(transferId, userId)).length > 0;

export type AcceptError = "not-found" | "expired" | "needs-plan";

/**
 * The recipient accepts: the organization becomes theirs at once, on one of
 * their slots. Refused while they have no plan that grants access or no free
 * slot; the offer stays open meanwhile.
 */
export const acceptIncomingTransfer = async (
	userId: string,
	transferId: string,
	now = new Date(),
): Promise<Result<null, AcceptError>> => {
	const transfer = await findTransfer(transferId);
	if (
		!transfer ||
		transfer.toUserId !== userId ||
		(transfer.status !== "pending" && transfer.status !== "accepted")
	)
		return { ok: false, error: "not-found" };
	if (transfer.expiresAt <= now) return { ok: false, error: "expired" };
	if (!(await resolveMembership(userId, transfer.organizationId)))
		return { ok: false, error: "not-found" };

	const completion = await completeTransfer(transferId, now);
	switch (completion.result) {
		case "completed":
			transferLogger.info("Organization transferred", {
				transferId,
				organizationId: transfer.organizationId,
			});
			await sendCompletionEmails(completion.transfer);
			return { ok: true, data: null };
		case "needs-plan":
			return { ok: false, error: "needs-plan" };
		case "refused":
			transferLogger.warn("Transfer refused on completion", {
				transferId,
				reason: completion.reason,
			});
			return { ok: false, error: "not-found" };
		case "not-open":
			return { ok: false, error: "not-found" };
	}
};

/** After a member leaves or is removed; a no-op while they are still a member. */
export const cancelTransfersToMember = async (
	organizationId: string,
	userId: string,
) => {
	for (const { id } of await cancelTransfersToFormerMember(
		organizationId,
		userId,
	))
		transferLogger.info("Canceled a transfer whose recipient left", {
			transferId: id,
			organizationId,
		});
};

const sendCompletionEmails = async (transfer: TransferRow) => {
	const [org, contacts] = await Promise.all([
		findOrganizationForTransfer(transfer.organizationId),
		findUserContacts([transfer.fromUserId, transfer.toUserId]),
	]);
	const from = contacts.find((contact) => contact.id === transfer.fromUserId);
	const to = contacts.find((contact) => contact.id === transfer.toUserId);
	const organizationName = org?.name ?? "";
	const context = { transferId: transfer.id };
	if (to)
		await sendLogged(
			() =>
				emailClient.send({
					to: to.email,
					template: TransferCompletedNewOwnerEmail,
					props: { organizationName },
				}),
			context,
		);
	if (from)
		await sendLogged(
			() =>
				emailClient.send({
					to: from.email,
					template: TransferCompletedOldOwnerEmail,
					props: { organizationName, toName: to?.name ?? "" },
				}),
			context,
		);
};
