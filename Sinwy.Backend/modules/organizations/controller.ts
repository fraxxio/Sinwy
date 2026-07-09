import { auth } from "@authModule";
import type { Handler } from "@backend/lib/app/types";
import { createOrganizationBody } from "@backend/modules/organizations/utils";
import { createOrganization, getOrganizationStatus } from "./service";

const json = (data: unknown, status: number) => Response.json(data, { status });

export const createOrganizationHandler: Handler = async (c) => {
	const session = await auth.api.getSession({ headers: c.req.headers });
	if (!session) return json({ error: "Unauthorized" }, 401);

	const body = createOrganizationBody.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!body.success) return json({ error: "Invalid body" }, 400);

	const org = await createOrganization(session.user.id, body.data.name);
	return json(org, 201);
};

export const getOrganizationStatusHandler: Handler = async (c) => {
	const session = await auth.api.getSession({ headers: c.req.headers });
	if (!session) return json({ error: "Unauthorized" }, 401);

	const { id } = c.req.params as { id: string };
	const status = await getOrganizationStatus(session.user.id, id);
	if (!status) return json({ error: "Not found" }, 404);

	return json({ status }, 200);
};
