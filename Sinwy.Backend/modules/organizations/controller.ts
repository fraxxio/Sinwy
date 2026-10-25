import { membershipFrom, sessionFrom } from "@authModule";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler } from "@backend/lib/app/types";
import {
	createOrganizationBody,
	organizationProfileBody,
} from "@backend/modules/organizations/utils";
import { API_ERROR_CODES } from "@sinwy/shared";
import {
	activateOrganization,
	completeOrganizationOnboarding,
	createOrganization,
	deactivateOrganization,
	getOrganizationOnboarding,
	listOrganizations,
	saveOrganizationProfile,
} from "./service";

const respondWriteError = (error: "not-found" | "inactive") => {
	switch (error) {
		case "inactive":
			return fail(
				"This organization doesn't have an active plan yet",
				409,
				API_ERROR_CODES.ORGANIZATION_INACTIVE,
			);
		case "not-found":
			return fail("Not found", 404);
	}
};

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

export const listOrganizationsHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	return ok(await listOrganizations(user.id));
};

export const getOrganizationOnboardingHandler: Handler = async (c) => {
	const onboarding = await getOrganizationOnboarding(membershipFrom(c));
	return ok(onboarding);
};

export const saveOrganizationProfileHandler: Handler = async (c) => {
	const body = organizationProfileBody.safeParse(
		await c.req.json().catch(() => null),
	);
	// the form validates the same rules, so a rejection here is worth naming
	if (!body.success)
		return fail(body.error.issues[0]?.message ?? "Invalid body", 400);

	const result = await saveOrganizationProfile(membershipFrom(c), body.data);
	if (!result.ok) return respondWriteError(result.error);

	return ok(result.data, 200, "Profile saved");
};

export const completeOrganizationOnboardingHandler: Handler = async (c) => {
	const result = await completeOrganizationOnboarding(membershipFrom(c));
	if (!result.ok) return respondWriteError(result.error);

	return ok(result.data);
};

export const activateOrganizationHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	const { organizationId } = c.req.params as { organizationId: string };
	const result = await activateOrganization(user.id, organizationId);
	if (result.ok) return ok(null, 200, "Organization activated");

	switch (result.error) {
		case "not-found":
			return fail("Not found", 404);
		case "no-plan":
			return fail(
				"You need an active plan to activate an organization",
				409,
				API_ERROR_CODES.PLAN_REQUIRED,
			);
		case "limit-reached":
			return fail(
				"Your plan has no free organization slot; deactivate one or upgrade",
				409,
				API_ERROR_CODES.ORGANIZATION_LIMIT_REACHED,
			);
	}
};

export const deactivateOrganizationHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	const { organizationId } = c.req.params as { organizationId: string };
	return (await deactivateOrganization(user.id, organizationId))
		? ok(null, 200, "Organization deactivated")
		: fail("Not found", 404);
};
