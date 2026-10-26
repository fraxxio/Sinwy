import { membershipFrom, sessionFrom } from "@authModule";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler } from "@backend/lib/app/types";
import { API_ERROR_CODES, offerTransferBody } from "@sinwy/shared";
import {
	type AcceptError,
	acceptIncomingTransfer,
	cancelTransfer,
	declineIncomingTransfer,
	getOpenTransfer,
	listIncomingTransfers,
	type OfferError,
	offerTransfer,
} from "./service";

const failOffer = (error: OfferError) => {
	switch (error) {
		case "self":
			return fail("You already own this organization", 400);
		case "not-a-member":
			return fail("Only a member of the organization can receive it", 400);
		case "transfer-pending":
			return fail(
				"An ownership transfer is already pending",
				409,
				API_ERROR_CODES.TRANSFER_PENDING,
			);
		case "not-found":
			return fail("Not found", 404);
		case "inactive":
			return fail(
				"Only an organization with an active plan can be transferred",
				409,
				API_ERROR_CODES.ORGANIZATION_INACTIVE,
			);
		case "suspended":
			return fail(
				"This organization is suspended; resume it first",
				409,
				API_ERROR_CODES.ORGANIZATION_SUSPENDED,
			);
	}
};

const failAccept = (error: AcceptError) => {
	switch (error) {
		case "not-found":
			return fail("This offer is no longer open", 404);
		case "expired":
			return fail("This offer has expired", 410);
		case "needs-slot":
			return fail(
				"Your plan has no free organization slot; upgrade it to take over this organization",
				409,
				API_ERROR_CODES.RECIPIENT_NEEDS_PLAN,
			);
	}
};

export const getOpenTransferHandler: Handler = async (c) =>
	ok(await getOpenTransfer(membershipFrom(c)));

export const offerTransferHandler: Handler = async (c) => {
	const body = offerTransferBody.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!body.success) return fail("Invalid body", 400);

	const { user } = sessionFrom(c);
	const result = await offerTransfer(
		membershipFrom(c),
		user.id,
		body.data.userId,
	);
	return result.ok
		? ok(result.data, 201, "Transfer offered")
		: failOffer(result.error);
};

export const cancelTransferHandler: Handler = async (c) =>
	(await cancelTransfer(membershipFrom(c)))
		? ok(null, 200, "Transfer canceled")
		: fail("No pending transfer", 404);

export const listIncomingTransfersHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	return ok(await listIncomingTransfers(user.id));
};

export const acceptTransferHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	const { transferId } = c.req.params as { transferId: string };
	const result = await acceptIncomingTransfer(user.id, transferId);
	if (!result.ok) return failAccept(result.error);
	return ok(
		result.data,
		200,
		result.data.status === "completed"
			? "The organization is yours"
			: "Choose a plan to take over the organization",
	);
};

export const declineTransferHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	const { transferId } = c.req.params as { transferId: string };
	return (await declineIncomingTransfer(user.id, transferId))
		? ok(null, 200, "Transfer declined")
		: fail("This offer is no longer open", 404);
};
