import { auth } from "@authModule";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler } from "@backend/lib/app/types";
import { createOrganizationBody } from "@backend/modules/organizations/utils";
import { createOrganization, getOrganizationStatus } from "./service";

export const createOrganizationHandler: Handler = async (c) => {
	const session = await auth.api.getSession({ headers: c.req.headers });
	if (!session) return fail("Unauthorized", 401);

	const body = createOrganizationBody.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!body.success) return fail("Invalid body", 400);

	const org = await createOrganization(session.user.id, body.data.name);
	return ok(org, 201, "Organization created");
};

export const getOrganizationStatusHandler: Handler = async (c) => {
	const session = await auth.api.getSession({ headers: c.req.headers });
	if (!session) return fail("Unauthorized", 401);

	const { id } = c.req.params as { id: string };
	const status = await getOrganizationStatus(session.user.id, id);
	if (!status) return fail("Not found", 404);

	return ok({ status });
};
