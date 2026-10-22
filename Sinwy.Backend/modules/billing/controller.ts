import { membershipFrom, sessionFrom } from "@authModule";
import type { PolarFailure } from "@backend/infrastructure/polar";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler } from "@backend/lib/app/types";
import { API_ERROR_CODES, changePlanBody } from "@sinwy/shared";
import {
	getInvoiceDownload,
	invoiceListQuery,
	listOrganizationInvoices,
} from "./invoices";
import {
	changeOrganizationPlan,
	getCheckoutOrganization,
	getOrganizationStatus,
	getOrganizationSubscription,
} from "./service";

const failPolar = (failure: PolarFailure) =>
	failure === "rejected"
		? fail("The billing provider refused this request", 422)
		: fail("The billing provider is unavailable; try again later", 502);

export const getOrganizationStatusHandler: Handler = async (c) => {
	const status = await getOrganizationStatus(membershipFrom(c));
	return ok({ status });
};

export const getCheckoutOrganizationHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);

	const { checkoutId } = c.req.params as { checkoutId: string };
	const result = await getCheckoutOrganization(user.id, checkoutId);
	if (!result) return fail("Not found", 404);

	return ok(result);
};

export const getSubscriptionHandler: Handler = async (c) => {
	const subscription = await getOrganizationSubscription(membershipFrom(c));
	return subscription ? ok(subscription) : fail("Not found", 404);
};

export const changePlanHandler: Handler = async (c) => {
	const body = changePlanBody.safeParse(await c.req.json().catch(() => null));
	if (!body.success) return fail("Invalid body", 400);

	const result = await changeOrganizationPlan(
		membershipFrom(c),
		body.data.plan,
	);
	if (result.ok) return ok(result.data, 200, "Plan changed");

	switch (result.error) {
		case "not-found":
			return fail("Not found", 404);
		case "inactive":
			return fail(
				"This organization has no active subscription; start a checkout instead",
				409,
				API_ERROR_CODES.ORGANIZATION_INACTIVE,
			);
		case "same-plan":
			return fail("The organization is already on this plan", 400);
		case "canceled":
			return fail(
				"The subscription is canceled; renew it before changing plans",
				409,
			);
		case "locked":
			return fail(
				"The subscription is being updated; try again in a moment",
				409,
			);
		case "rejected":
		case "unavailable":
			return failPolar(result.error);
	}
};

export const listInvoicesHandler: Handler = async (c) => {
	const query = invoiceListQuery.safeParse(
		Object.fromEntries(new URL(c.req.url).searchParams),
	);
	if (!query.success) return fail("Invalid query", 400);

	const result = await listOrganizationInvoices(
		membershipFrom(c).organizationId,
		query.data,
	);
	return result.ok ? ok(result.data) : failPolar(result.error);
};

export const downloadInvoiceHandler: Handler = async (c) => {
	const { orderId } = c.req.params as { orderId: string };
	const result = await getInvoiceDownload(
		membershipFrom(c).organizationId,
		orderId,
	);

	switch (result.status) {
		case "ready":
			return ok({ url: result.url });
		case "generating":
			return ok(null, 202, "The invoice is being generated; try again shortly");
		case "needs-details":
			return fail(result.message, 409);
		case "not-paid":
			return fail(
				"This order isn't paid yet, so it has no invoice",
				409,
				API_ERROR_CODES.ORDER_NOT_PAID,
			);
		case "not-found":
			return fail("Not found", 404);
		case "failed":
			return failPolar(result.error);
	}
};
