import {
	describePolarError,
	PolarApiErrors,
	polarCore,
} from "@backend/infrastructure/polar";
import { createLogger } from "@logger";
import { PolarClientError } from "@polar-sh/sdk";
import {
	createCustomers,
	deleteExternalCustomers,
	getExternalCustomers,
	listCustomers,
	updateCustomers,
	updateExternalCustomers,
} from "@polar-sh/sdk/2026-10/services/customers";
import { AUTH_ERROR_CODES } from "@sinwy/shared";
import { APIError } from "better-auth/api";
import { toPolarFailure } from "./polar";

const billingLogger = createLogger("billing:customer");

type CustomerOwner = { id: string; email: string; name: string };

const isNotFound = (error: unknown) =>
	error instanceof PolarClientError && error.statusCode === 404;

// a concurrent ensure created the customer between our lookup and our create
const isExternalIdTaken = (error: unknown, externalId: string) =>
	error instanceof PolarApiErrors.HTTPValidationError &&
	(error.error.detail ?? []).some(
		(detail) =>
			detail.loc[0] === "body" &&
			detail.loc[1] === "external_id" &&
			detail.input === externalId,
	);

const accountRejected = () =>
	new APIError("CONFLICT", {
		message: "We couldn't set up billing for this account. Contact support.",
		code: AUTH_ERROR_CODES.BILLING_ACCOUNT_REJECTED,
	});

const billingUnavailable = () =>
	new APIError("SERVICE_UNAVAILABLE", {
		message: "Billing is unavailable right now. Try again in a moment.",
		code: AUTH_ERROR_CODES.BILLING_UNAVAILABLE,
	});

const linkedElsewhere = (userId: string, reason: string) => {
	billingLogger.error("Polar customer email is taken", { userId, reason });
	return accountRejected();
};

const findCustomer = async (externalId: string) => {
	try {
		return await getExternalCustomers(polarCore)(externalId);
	} catch (error) {
		if (isNotFound(error)) return null;
		throw error;
	}
};

/** Same rules as the plugin's sign-up hook: reuse an unlinked customer with the email, else create. */
const linkOrCreate = async (owner: CustomerOwner) => {
	const { items } = await listCustomers(polarCore)({ email: owner.email });
	const individual = items.find((customer) => customer.type === "individual");
	if (individual?.external_id === owner.id) return;
	if (individual?.external_id)
		throw linkedElsewhere(owner.id, "linked to another user");
	if (individual) {
		await updateCustomers(polarCore)(individual.id, {
			external_id: owner.id,
			name: owner.name,
		});
		return;
	}
	if (items.some((customer) => customer.type === "team"))
		throw linkedElsewhere(owner.id, "a team customer has it");
	try {
		await createCustomers(polarCore)({
			email: owner.email,
			name: owner.name,
			external_id: owner.id,
		});
	} catch (error) {
		if (!isExternalIdTaken(error, owner.id)) throw error;
		await getExternalCustomers(polarCore)(owner.id);
	}
};

/**
 * Checkout and the portal need the user's Polar customer under the account's
 * email; sign-up doesn't create one, so they ensure it first.
 */
export const ensurePolarCustomer = async (owner: CustomerOwner) => {
	try {
		const customer = await findCustomer(owner.id);
		if (!customer) return await linkOrCreate(owner);
		// heals a user update whose sync failed
		if (customer.email !== owner.email || customer.name !== owner.name)
			await updateCustomers(polarCore)(customer.id, {
				email: owner.email,
				name: owner.name,
			});
	} catch (error) {
		if (error instanceof APIError) throw error;
		const failure = toPolarFailure(error, "Polar customer ensure failed", {
			userId: owner.id,
		});
		throw failure === "unavailable" ? billingUnavailable() : accountRejected();
	}
};

/** Best effort: a user with no customer yet has nothing to sync. */
export const syncPolarCustomer = async (owner: CustomerOwner) => {
	try {
		await updateExternalCustomers(polarCore)(owner.id, {
			email: owner.email,
			name: owner.name,
		});
	} catch (error) {
		if (isNotFound(error)) return;
		billingLogger.error("Polar customer sync failed", {
			userId: owner.id,
			...describePolarError(error),
		});
	}
};

/**
 * Best effort. Anonymized, not removed: the customer keeps the deleted id as
 * its external id, so its late webhooks find no user.
 */
export const deletePolarCustomer = async (userId: string) => {
	try {
		await deleteExternalCustomers(polarCore)(userId, { anonymize: true });
	} catch (error) {
		if (isNotFound(error)) return;
		billingLogger.error("Polar customer delete failed", {
			userId,
			...describePolarError(error),
		});
	}
};
