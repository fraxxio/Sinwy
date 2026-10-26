import { describePolarError } from "@backend/infrastructure/polar";
import { createLogger } from "@logger";
import { AUTH_ERROR_CODES } from "@sinwy/shared";
import { APIError } from "better-auth/api";
import { listBillableSubscriptions, projectSubscription } from "./projection";
import { findUserSubscription } from "./repository";

const billingLogger = createLogger("billing:checkout");

const refuse = (): never => {
	throw new APIError("BAD_REQUEST", {
		message: "You already have a plan; change or resume it instead",
		code: AUTH_ERROR_CODES.PLAN_EXISTS,
	});
};

/**
 * Guards POST /checkout, which buys the user's own plan: one plan per user,
 * so a user with a billable one (paused included) changes or resumes it
 * instead. Polar is asked too, in case a webhook never landed; a failed
 * lookup lets the checkout through, and the projection revokes a second plan.
 * Returns whether the checkout may offer the product's trial: one per user.
 */
export const ensureCheckoutAllowed = async (userId: string) => {
	const stored = await findUserSubscription(userId);
	if (stored?.subscriptionId) refuse();

	const [billable] = await listBillableSubscriptions(userId).catch(
		(error: unknown) => {
			billingLogger.warn("Polar subscription lookup failed", {
				userId,
				...describePolarError(error),
			});
			return [];
		},
	);
	if (billable) {
		await projectSubscription(billable);
		refuse();
	}
	return { allowTrial: !stored?.trialUsedAt };
};
