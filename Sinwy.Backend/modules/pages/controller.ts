import { membershipFrom, sessionFrom } from "@authModule";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler, IReqContext } from "@backend/lib/app/types";
import {
	API_ERROR_CODES,
	createPageSchema,
	savePageContentSchema,
	updatePageSchema,
} from "@sinwy/shared";
import type { z } from "zod";
import {
	createPage,
	deletePage,
	getPage,
	getPublicPage,
	listPages,
	type PageError,
	publishPage,
	savePageContent,
	unpublishPage,
	updatePage,
} from "./service";

/** Far above what 200 blocks of builder props need, far below the server's own cap. */
export const MAX_PAGE_CONTENT_BYTES = 256 * 1024;

const respondError = (error: PageError) => {
	switch (error) {
		case "inactive":
			return fail(
				"This organization doesn't have an active plan yet",
				409,
				API_ERROR_CODES.ORGANIZATION_INACTIVE,
			);
		case "limit-reached":
			return fail(
				"You've used every page your plan includes",
				409,
				API_ERROR_CODES.PAGE_LIMIT_REACHED,
			);
		case "upgrade-required":
			return fail(
				"Your plan doesn't include this",
				402,
				API_ERROR_CODES.PLAN_UPGRADE_REQUIRED,
			);
		case "slug-taken":
			return fail(
				"Another page already uses this address",
				409,
				API_ERROR_CODES.PAGE_SLUG_TAKEN,
			);
		case "version-conflict":
			return fail(
				"This page was saved somewhere else. Reload to get the latest version.",
				409,
				API_ERROR_CODES.PAGE_VERSION_CONFLICT,
			);
		case "not-found":
			return fail("Not found", 404);
	}
};

const pageIdFrom = (c: IReqContext) =>
	(c.req.params as { pageId: string }).pageId;

const parse = <T extends z.ZodType>(schema: T, raw: unknown) => {
	const body = schema.safeParse(raw);
	return body.success
		? ({ ok: true, data: body.data } as const)
		: ({
				ok: false,
				response: fail(body.error.issues[0]?.message ?? "Invalid body", 400),
			} as const);
};

const parseBody = async <T extends z.ZodType>(c: IReqContext, schema: T) =>
	parse(schema, await c.req.json().catch(() => null));

const parseContentBody = async (c: IReqContext) => {
	const bytes = await c.req.arrayBuffer();
	if (bytes.byteLength > MAX_PAGE_CONTENT_BYTES)
		return {
			ok: false,
			response: fail("This page is too large to save", 413),
		} as const;
	let raw: unknown = null;
	try {
		raw = JSON.parse(new TextDecoder().decode(bytes));
	} catch {}
	return parse(savePageContentSchema, raw);
};

export const listPagesHandler: Handler = async (c) =>
	ok(await listPages(membershipFrom(c)));

export const getPageHandler: Handler = async (c) => {
	const result = await getPage(membershipFrom(c), pageIdFrom(c));
	return result.ok ? ok(result.data) : respondError(result.error);
};

export const createPageHandler: Handler = async (c) => {
	const body = await parseBody(c, createPageSchema);
	if (!body.ok) return body.response;

	const result = await createPage(
		membershipFrom(c),
		sessionFrom(c).user.id,
		body.data,
	);
	return result.ok
		? ok(result.data, 201, "Page created")
		: respondError(result.error);
};

export const updatePageHandler: Handler = async (c) => {
	const body = await parseBody(c, updatePageSchema);
	if (!body.ok) return body.response;

	const result = await updatePage(membershipFrom(c), pageIdFrom(c), body.data);
	return result.ok
		? ok(result.data, 200, "Page saved")
		: respondError(result.error);
};

export const savePageContentHandler: Handler = async (c) => {
	const body = await parseContentBody(c);
	if (!body.ok) return body.response;

	const result = await savePageContent(
		membershipFrom(c),
		sessionFrom(c).user.id,
		pageIdFrom(c),
		body.data,
	);
	return result.ok
		? ok(result.data, 200, "Page content saved")
		: respondError(result.error);
};

export const deletePageHandler: Handler = async (c) => {
	const result = await deletePage(membershipFrom(c), pageIdFrom(c));
	return result.ok ? ok(null, 200, "Page deleted") : respondError(result.error);
};

export const publishPageHandler: Handler = async (c) => {
	const result = await publishPage(membershipFrom(c), pageIdFrom(c));
	return result.ok
		? ok(result.data, 200, "Page published")
		: respondError(result.error);
};

export const unpublishPageHandler: Handler = async (c) => {
	const result = await unpublishPage(membershipFrom(c), pageIdFrom(c));
	return result.ok
		? ok(result.data, 200, "Page unpublished")
		: respondError(result.error);
};

export const getPublicPageHandler: Handler = async (c) => {
	const { slug, pageSlug } = c.req.params as { slug: string; pageSlug: string };
	const result = await getPublicPage(slug, pageSlug);
	return result ? ok(result) : fail("This page isn't available", 404);
};
