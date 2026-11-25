import { membershipFrom, sessionFrom } from "@authModule";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler, IReqContext } from "@backend/lib/app/types";
import {
	ImageError,
	readImageUpload,
	respondImageError,
} from "@backend/lib/image";
import {
	API_ERROR_CODES,
	createPageSchema,
	limitsFor,
	PAGE_DOCUMENT_LIMITS,
	pageBaseVersionSchema,
	savePageContentSchema,
	updatePageSchema,
} from "@sinwy/shared";
import type { z } from "zod";
import {
	createPage,
	deletePage,
	discardDraft,
	getPage,
	getPublicPage,
	listPages,
	type PageError,
	publishPage,
	savePageContent,
	unpublishPage,
	updatePage,
	uploadPageImage,
} from "./service";

const MB = 1024 * 1024;

const formatBytes = (bytes: number) =>
	bytes >= 1024 * MB
		? `${Math.round((bytes / (1024 * MB)) * 10) / 10} GB`
		: `${Math.round(bytes / MB)} MB`;

const quotaExceeded = (limit: number) =>
	fail(
		`Your plan includes ${formatBytes(limit)} for page photos, and it's full. Photos you've removed from your pages free their space within a day.`,
		409,
		API_ERROR_CODES.PAGE_IMAGE_QUOTA_EXCEEDED,
	);

const respondError = (error: PageError, limits = limitsFor(null)) => {
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
		case "not-published":
			return fail(
				"This page isn't published, so there's nothing to go back to",
				409,
				API_ERROR_CODES.PAGE_NOT_PUBLISHED,
			);
		case "quota-exceeded":
			return quotaExceeded(limits.pageImageBytes);
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
	if (bytes.byteLength > PAGE_DOCUMENT_LIMITS.maxBytes)
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
	const result = await deletePage(
		membershipFrom(c),
		sessionFrom(c).user,
		pageIdFrom(c),
	);
	return result.ok ? ok(null, 200, "Page deleted") : respondError(result.error);
};

export const publishPageHandler: Handler = async (c) => {
	const body = await parseBody(c, pageBaseVersionSchema);
	if (!body.ok) return body.response;

	const result = await publishPage(
		membershipFrom(c),
		sessionFrom(c).user,
		pageIdFrom(c),
		body.data,
	);
	return result.ok
		? ok(result.data, 200, "Page published")
		: respondError(result.error);
};

export const unpublishPageHandler: Handler = async (c) => {
	const result = await unpublishPage(
		membershipFrom(c),
		sessionFrom(c).user,
		pageIdFrom(c),
	);
	return result.ok
		? ok(result.data, 200, "Page unpublished")
		: respondError(result.error);
};

export const discardDraftHandler: Handler = async (c) => {
	const body = await parseBody(c, pageBaseVersionSchema);
	if (!body.ok) return body.response;

	const result = await discardDraft(
		membershipFrom(c),
		sessionFrom(c).user.id,
		pageIdFrom(c),
		body.data,
	);
	return result.ok
		? ok(result.data, 200, "Unpublished changes discarded")
		: respondError(result.error);
};

export const getPublicPageHandler: Handler = async (c) => {
	const { slug, pageSlug } = c.req.params as { slug: string; pageSlug: string };
	const result = await getPublicPage(slug, pageSlug);
	return result ? ok(result) : fail("This page isn't available", 404);
};

export const uploadPageImageHandler: Handler = async (c) => {
	const membership = membershipFrom(c);
	try {
		const file = await readImageUpload(c.req);
		if (!file) return fail("Missing file", 400);
		const result = await uploadPageImage(membership, file);
		return result.ok
			? ok(result.data, 201, "Photo uploaded")
			: respondError(result.error, limitsFor(membership.plan));
	} catch (error) {
		if (error instanceof ImageError) return respondImageError(error);
		throw error;
	}
};
