import { z } from "zod";

export const ORGANIZATION_TRANSFER_STATUSES = [
	"pending",
	"accepted",
	"completed",
	"declined",
	"canceled",
	"expired",
] as const;

export type OrganizationTransferStatus =
	(typeof ORGANIZATION_TRANSFER_STATUSES)[number];

/** Pending and accepted: at most one per organization. */
export type OpenTransferStatus = Extract<
	OrganizationTransferStatus,
	"pending" | "accepted"
>;

export const TRANSFER_OFFER_DAYS = 7;

/** The owner's view of the organization's open transfer. */
export type OrganizationTransferDto = {
	id: string;
	status: OpenTransferStatus;
	expiresAt: string;
	to: { userId: string; name: string; email: string };
};

/** An open transfer offered to the caller. */
export type IncomingTransferDto = {
	id: string;
	status: OpenTransferStatus;
	expiresAt: string;
	/** No tier: the recipient may be staff, who never see it (D15). */
	organization: { id: string; name: string };
	from: { name: string; email: string };
};

/** `accepted`: the recipient has no plan; the transfer completes once their checkout's plan lands. */
export type AcceptTransferDto = { status: "completed" | "accepted" };

export const offerTransferBody = z.object({ userId: z.string().min(1) });

export type OfferTransferBody = z.infer<typeof offerTransferBody>;
