import { membershipFrom, sessionFrom } from "@authModule";
import type { PolarFailure } from "@backend/infrastructure/polar";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler } from "@backend/lib/app/types";
import { API_ERROR_CODES, changePlanBody } from "@sinwy/shared";
import {
	getInvoiceDownload,
	invoiceListQuery,
	listAccountInvoices,
} from "./invoices";
import {
	cancelAccountPlan,
	cancelPendingPlanChange,
	changeAccountPlan,
	getAccountSubscription,
	getOrganizationStatus,
	resumeAccountPlan,
	type SubscriptionActionError,
	suspendAccountPlan,
	uncancelAccountPlan,
	unsuspendAccountPlan,
} from "./service";

const failPolar = (failure: PolarFailure) =>
	failure === "rejected"
		? fail("The billing provider refused this request", 422)
		: fail("The billing provider is unavailable; try again later", 502);

const failNoPlan = () =>
	fail(
		"You have no active plan; start a checkout instead",
		409,
		API_ERROR_CODES.PLAN_REQUIRED,
	);

const failPlanSuspended = () =>
	fail(
		"Your plan is suspended; resume it first",
		409,
		API_ERROR_CODES.PLAN_SUSPENDED,
	);

const failPausePending = () =>
	fail(
		"Your plan is set to suspend at the end of the period; undo that first",
		409,
		API_ERROR_CODES.SUSPENSION_PENDING,
	);

const failLocked = () =>
	fail("The subscription is being updated; try again in a moment", 409);

const failCancelPending = () =>
	fail(
		"Your plan is set to cancel at the end of the period; undo that first",
		409,
		API_ERROR_CODES.CANCELLATION_PENDING,
	);

const failSubscriptionAction = (error: SubscriptionActionError) => {
	switch (error) {
		case "inactive":
			return failNoPlan();
		case "suspended":
			return failPlanSuspended();
		case "not-suspended":
			return fail(
				"Your plan isn't suspended",
				409,
				API_ERROR_CODES.PLAN_NOT_SUSPENDED,
			);
		case "trialing":
			return fail(
				"A subscription can't be suspended during its trial",
				409,
				API_ERROR_CODES.SUBSCRIPTION_TRIALING,
			);
		case "past-due":
			return fail(
				"The last payment failed; update your payment method before suspending",
				409,
				API_ERROR_CODES.SUBSCRIPTION_PAST_DUE,
			);
		case "pause-pending":
			return failPausePending();
		case "pause-not-pending":
			return fail(
				"Your plan isn't set to suspend",
				409,
				API_ERROR_CODES.SUSPENSION_NOT_PENDING,
			);
		case "cancel-pending":
			return failCancelPending();
		case "cancel-not-pending":
			return fail(
				"Your plan isn't set to cancel",
				409,
				API_ERROR_CODES.CANCELLATION_NOT_PENDING,
			);
		case "plan-change-pending":
			return fail(
				"A plan change is scheduled; keep your current plan first",
				409,
				API_ERROR_CODES.PLAN_CHANGE_PENDING,
			);
		case "locked":
			return failLocked();
		case "payment-failed":
			return fail(
				"The payment for the new period failed; update your payment method on Polar and try again",
				402,
				API_ERROR_CODES.RESUME_PAYMENT_FAILED,
			);
		case "rejected":
		case "unavailable":
			return failPolar(error);
	}
};

export const getOrganizationStatusHandler: Handler = async (c) => {
	const status = await getOrganizationStatus(membershipFrom(c));
	return ok({ status });
};

export const getSubscriptionHandler: Handler = async (c) =>
	ok(await getAccountSubscription(sessionFrom(c).user.id));

export const changePlanHandler: Handler = async (c) => {
	const body = changePlanBody.safeParse(await c.req.json().catch(() => null));
	if (!body.success) return fail("Invalid body", 400);

	const result = await changeAccountPlan(
		sessionFrom(c).user.id,
		body.data.plan,
		body.data.keep,
	);
	if (result.ok)
		return ok(
			result.data,
			200,
			result.data.pendingChange?.plan === body.data.plan
				? "Plan change scheduled"
				: "Plan changed",
		);

	switch (result.error) {
		case "inactive":
			return failNoPlan();
		case "suspended":
			return failPlanSuspended();
		case "pause-pending":
			return failPausePending();
		case "cancel-pending":
			return failCancelPending();
		case "same-plan":
			return fail("You are already on this plan", 400);
		case "picks-required":
			return fail(
				"More organizations are active than the new plan allows; choose which stay active",
				409,
				API_ERROR_CODES.DOWNGRADE_PICKS_REQUIRED,
			);
		case "invalid-picks":
			return fail(
				"Choose only your active organizations, no more than the new plan allows",
				400,
			);
		case "canceled":
			return fail(
				"The subscription is canceled; renew it before changing plans",
				409,
			);
		case "locked":
			return failLocked();
		case "rejected":
		case "unavailable":
			return failPolar(result.error);
	}
};

export const cancelPlanChangeHandler: Handler = async (c) => {
	const result = await cancelPendingPlanChange(sessionFrom(c).user.id);
	if (result.ok) return ok(result.data, 200, "Plan change canceled");

	switch (result.error) {
		case "inactive":
			return failNoPlan();
		case "not-pending":
			return fail(
				"No plan change is scheduled",
				409,
				API_ERROR_CODES.PLAN_CHANGE_NOT_PENDING,
			);
		case "locked":
			return failLocked();
		case "rejected":
		case "unavailable":
			return failPolar(result.error);
	}
};

export const suspendHandler: Handler = async (c) => {
	const result = await suspendAccountPlan(sessionFrom(c).user.id);
	return result.ok
		? ok(result.data, 200, "Suspension scheduled")
		: failSubscriptionAction(result.error);
};

export const unsuspendHandler: Handler = async (c) => {
	const result = await unsuspendAccountPlan(sessionFrom(c).user.id);
	return result.ok
		? ok(result.data, 200, "Suspension canceled")
		: failSubscriptionAction(result.error);
};

export const cancelHandler: Handler = async (c) => {
	const result = await cancelAccountPlan(sessionFrom(c).user.id);
	return result.ok
		? ok(result.data, 200, "Cancellation scheduled")
		: failSubscriptionAction(result.error);
};

export const uncancelHandler: Handler = async (c) => {
	const result = await uncancelAccountPlan(sessionFrom(c).user.id);
	return result.ok
		? ok(result.data, 200, "Cancellation undone")
		: failSubscriptionAction(result.error);
};

export const resumeHandler: Handler = async (c) => {
	const result = await resumeAccountPlan(sessionFrom(c).user.id);
	if (!result.ok) return failSubscriptionAction(result.error);
	return result.data.billing?.subscriptionStatus === "past_due"
		? ok(
				result.data,
				200,
				"Resumed, but the payment failed; update your payment method on Polar",
			)
		: ok(result.data, 200, "Resumed");
};

export const listInvoicesHandler: Handler = async (c) => {
	const query = invoiceListQuery.safeParse(
		Object.fromEntries(new URL(c.req.url).searchParams),
	);
	if (!query.success) return fail("Invalid query", 400);

	const result = await listAccountInvoices(sessionFrom(c).user.id, query.data);
	return result.ok ? ok(result.data) : failPolar(result.error);
};

export const downloadInvoiceHandler: Handler = async (c) => {
	const { orderId } = c.req.params as { orderId: string };
	const result = await getInvoiceDownload(sessionFrom(c).user.id, orderId);

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
