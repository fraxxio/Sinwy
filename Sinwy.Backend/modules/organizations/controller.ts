import { sessionFrom } from "@authModule";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler } from "@backend/lib/app/types";
import {
	createOrganizationBody,
	organizationProfileBody,
} from "@backend/modules/organizations/utils";
import {
	completeOrganizationOnboarding,
	createOrganization,
	getCheckoutOrganization,
	getOrganizationOnboarding,
	getOrganizationStatus,
	saveOrganizationProfile,
} from "./service";

const respondWriteError = (error: "not-found" | "forbidden") =>
	error === "forbidden"
		? fail("You don't have permission to change this organization", 403)
		: fail("Not found", 404);

export const createOrganizationHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);

	const body = createOrganizationBody.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!body.success) return fail("Invalid body", 400);

	const org = await createOrganization(
		user.id,
		body.data.name,
		body.data.industry,
	);
	return ok(org, 201, "Organization created");
};

export const getOrganizationStatusHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);

	const { id } = c.req.params as { id: string };
	const status = await getOrganizationStatus(user.id, id);
	if (!status) return fail("Not found", 404);

	return ok({ status });
};

export const getCheckoutOrganizationHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);

	const { checkoutId } = c.req.params as { checkoutId: string };
	const result = await getCheckoutOrganization(user.id, checkoutId);
	if (!result) return fail("Not found", 404);

	return ok(result);
};

export const getOrganizationOnboardingHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);

	const { id } = c.req.params as { id: string };
	const onboarding = await getOrganizationOnboarding(user.id, id);
	if (!onboarding) return fail("Not found", 404);

	return ok(onboarding);
};

export const saveOrganizationProfileHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);

	const { id } = c.req.params as { id: string };
	const body = organizationProfileBody.safeParse(
		await c.req.json().catch(() => null),
	);
	// the form validates the same rules, so a rejection here is worth naming
	if (!body.success)
		return fail(body.error.issues[0]?.message ?? "Invalid body", 400);

	const result = await saveOrganizationProfile(user.id, id, body.data);
	if (!result.ok) return respondWriteError(result.error);

	return ok(result.data, 200, "Profile saved");
};

export const completeOrganizationOnboardingHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);

	const { id } = c.req.params as { id: string };
	const result = await completeOrganizationOnboarding(user.id, id);
	if (!result.ok) return respondWriteError(result.error);

	return ok(result.data);
};
