import {
	endReplacedSubscription,
	previewReplacedSubscription,
} from "@billingModule";
import { parseMemberRoles } from "@sinwy/shared";
import {
	findMembers,
	findOrganizationForTransfer,
	moveOwnership,
} from "./repository";

export type SupportTransferResult =
	| { ok: false; error: string }
	| {
			ok: true;
			applied: boolean;
			organization: { id: string; name: string };
			from: { userId: string; email: string };
			to: { userId: string; email: string };
			subscriptionId: string | null;
			outcome: unknown;
	  };

/**
 * Support path for moving an organization to another member without a new
 * checkout: the roles swap, the old owner's subscription is revoked with its
 * unused time refunded, and the organization is left inactive for the new
 * owner to renew. Reads only, unless `apply`.
 */
export const transferOwnershipBySupport = async ({
	organizationId,
	toUserId,
	apply,
	now = new Date(),
}: {
	organizationId: string;
	toUserId: string;
	apply: boolean;
	now?: Date;
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
		subscriptionId: org.subscriptionId,
	};
	if (!apply)
		return {
			ok: true,
			applied: false,
			...report,
			outcome:
				org.subscriptionId &&
				(await previewReplacedSubscription(org.subscriptionId, now)),
		};

	const swap = await moveOwnership(organizationId, owner.userId, toUserId);
	if (swap.result !== "swapped")
		return { ok: false, error: `Roles not swapped: ${swap.result}` };
	return {
		ok: true,
		applied: true,
		...report,
		outcome:
			org.subscriptionId &&
			(await endReplacedSubscription(org.subscriptionId, now)),
	};
};
