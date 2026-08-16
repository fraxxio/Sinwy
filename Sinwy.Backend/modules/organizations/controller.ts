import { sessionFrom } from "@authModule";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler } from "@backend/lib/app/types";
import { createOrganizationBody } from "@backend/modules/organizations/utils";
import {
	createOrganization,
	getCheckoutOrganization,
	getOrganizationStatus,
} from "./service";

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
