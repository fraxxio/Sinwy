import { membershipFrom } from "@authModule";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler, IReqContext } from "@backend/lib/app/types";
import { API_ERROR_CODES } from "@sinwy/shared";
import type { z } from "zod";
import {
	archiveService,
	createService,
	duplicateService,
	getService,
	listServices,
	updateService,
} from "./service";
import { createServiceBody, updateServiceBody } from "./utils";

const respondError = (error: "not-found" | "inactive") => {
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

const serviceIdFrom = (c: IReqContext) =>
	(c.req.params as { serviceId: string }).serviceId;

// the form validates the same rules, so a rejection here is worth naming
const parseBody = async <T extends z.ZodType>(c: IReqContext, schema: T) => {
	const body = schema.safeParse(await c.req.json().catch(() => null));
	return body.success
		? ({ ok: true, data: body.data } as const)
		: ({
				ok: false,
				response: fail(body.error.issues[0]?.message ?? "Invalid body", 400),
			} as const);
};

export const listServicesHandler: Handler = async (c) =>
	ok(await listServices(membershipFrom(c)));

export const getServiceHandler: Handler = async (c) => {
	const result = await getService(membershipFrom(c), serviceIdFrom(c));
	return result.ok ? ok(result.data) : respondError(result.error);
};

export const createServiceHandler: Handler = async (c) => {
	const body = await parseBody(c, createServiceBody);
	if (!body.ok) return body.response;

	const result = await createService(membershipFrom(c), body.data);
	return result.ok
		? ok(result.data, 201, "Service created")
		: respondError(result.error);
};

export const updateServiceHandler: Handler = async (c) => {
	const body = await parseBody(c, updateServiceBody);
	if (!body.ok) return body.response;

	const result = await updateService(
		membershipFrom(c),
		serviceIdFrom(c),
		body.data,
	);
	return result.ok
		? ok(result.data, 200, "Service saved")
		: respondError(result.error);
};

export const duplicateServiceHandler: Handler = async (c) => {
	const result = await duplicateService(membershipFrom(c), serviceIdFrom(c));
	return result.ok
		? ok(result.data, 201, "Service duplicated")
		: respondError(result.error);
};

export const archiveServiceHandler: Handler = async (c) => {
	const result = await archiveService(membershipFrom(c), serviceIdFrom(c));
	return result.ok
		? ok(null, 200, "Service archived")
		: respondError(result.error);
};
