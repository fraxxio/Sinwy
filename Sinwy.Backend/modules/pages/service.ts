import type { Membership } from "@authModule";
import { fileUrl, storageClient } from "@backend/infrastructure/storage";
import { imageExtension, validateImage } from "@backend/lib/image";
import { createLogger } from "@logger";
import {
	type ActivityActor,
	findPublicOrganizationPlan,
	recordActivity,
} from "@organizationsModule";
import { listPublicServices } from "@servicesModule";
import {
	blocksIn,
	type CreatePageInput,
	emptyPageDocument,
	featuresFor,
	limitsFor,
	lockedBlocksIn,
	type PageBaseVersionInput,
	type PageDetailDto,
	type PageDocument,
	type PageImageDto,
	type PageListDto,
	type PageListItemDto,
	type PageStatus,
	type PlanSlug,
	type PublicPageDto,
	type SavePageContentInput,
	type UpdatePageInput,
} from "@sinwy/shared";
import {
	type ContentSaveCheck,
	deletePage as deletePageRow,
	discardDraft as discardDraftRow,
	findLatestVersion,
	findPage,
	findPageLabels,
	findPages,
	findPinnedVersion,
	findPublishedPageBySlug,
	findPublishedPageIdBySlug,
	findServedPageIds,
	insertNextVersion,
	insertPageImageWithinLimit,
	insertPageWithinLimit,
	isSlugClash,
	type PageRow,
	type PageVersionRow,
	publishPage as publishPageRow,
	unpublishPage as unpublishPageRow,
	updatePage as updatePageRow,
} from "./repository";

export type PageError =
	| "not-found"
	| "inactive"
	| "limit-reached"
	| "upgrade-required"
	| "slug-taken"
	| "version-conflict"
	| "not-published"
	| "quota-exceeded";

type Result<T> = { ok: true; data: T } | { ok: false; error: PageError };

const pagesLogger = createLogger("pages");

const fail = <E extends PageError>(error: E) => ({ ok: false, error }) as const;

const servedPageIds = (membership: Membership) =>
	findServedPageIds(
		membership.organizationId,
		limitsFor(membership.plan).pages,
	);

const toListItemDto = (row: PageRow, served: Set<string>): PageListItemDto => ({
	id: row.id,
	title: row.title,
	slug: row.slug,
	status: row.status as PageStatus,
	live: row.status === "published" && served.has(row.id),
	updatedAt: row.updatedAt.toISOString(),
	publishedAt: row.publishedAt?.toISOString() ?? null,
});

/** `saved` is the version a write just made; without it the latest is read. */
const toDetailDto = async (
	membership: Membership,
	row: PageRow,
	saved?: PageVersionRow,
): Promise<PageDetailDto> => {
	const [served, latest] = await Promise.all([
		servedPageIds(membership),
		saved ?? findLatestVersion(row.id),
	]);
	if (!latest) throw new Error(`Page ${row.id} has no content version`);
	const pinned = row.publishedVersionId
		? await findPinnedVersion(row.publishedVersionId, latest.id)
		: null;
	return {
		...toListItemDto(row, served),
		seoTitle: row.seoTitle,
		seoDescription: row.seoDescription,
		createdAt: row.createdAt.toISOString(),
		latestVersion: {
			version: latest.version,
			content: latest.content,
			createdAt: latest.createdAt.toISOString(),
			savedAt: latest.updatedAt.toISOString(),
		},
		publishedVersion: pinned?.version ?? null,
		hasUnpublishedChanges:
			row.status === "published" && pinned?.matchesLatest === false,
	};
};

const slugTaken = async <T>(write: () => Promise<T>) => {
	try {
		return { ok: true, value: await write() } as const;
	} catch (error) {
		if (isSlugClash(error)) return { ok: false } as const;
		throw error;
	}
};

export const listPages = async (
	membership: Membership,
): Promise<PageListDto> => {
	const [rows, served] = await Promise.all([
		findPages(membership.organizationId),
		servedPageIds(membership),
	]);
	return {
		items: rows.map((row) => toListItemDto(row, served)),
		usage: { used: rows.length, limit: limitsFor(membership.plan).pages },
	};
};

export type PageLabel = { title: string; slug: string };

/** Titles and slugs of the organization's pages among `pageIds`; unknown ids are left out. */
export const getPageLabels = async (
	organizationId: string,
	pageIds: string[],
): Promise<Map<string, PageLabel>> =>
	new Map(
		(await findPageLabels(organizationId, pageIds)).map(
			({ id, title, slug }) => [id, { title, slug }],
		),
	);

export const getPage = async (
	membership: Membership,
	pageId: string,
): Promise<Result<PageDetailDto>> => {
	const row = await findPage(membership.organizationId, pageId);
	return row
		? { ok: true, data: await toDetailDto(membership, row) }
		: fail("not-found");
};

export const createPage = async (
	membership: Membership,
	userId: string,
	input: CreatePageInput,
): Promise<Result<PageDetailDto>> => {
	if (membership.status !== "active") return fail("inactive");
	const { organizationId } = membership;
	const inserted = await slugTaken(() =>
		insertPageWithinLimit(
			{
				id: crypto.randomUUID(),
				organizationId,
				title: input.title,
				slug: input.slug,
			},
			emptyPageDocument(),
			userId,
			limitsFor(membership.plan).pages,
		),
	);
	if (!inserted.ok) return fail("slug-taken");
	if (!inserted.value) return fail("limit-reached");
	return { ok: true, data: await toDetailDto(membership, inserted.value) };
};

const orNull = (value: string | undefined) =>
	value === undefined ? undefined : value || null;

export const updatePage = async (
	membership: Membership,
	pageId: string,
	input: UpdatePageInput,
): Promise<Result<PageDetailDto>> => {
	if (membership.status !== "active") return fail("inactive");
	const updated = await slugTaken(() =>
		updatePageRow(membership.organizationId, pageId, {
			title: input.title,
			slug: input.slug,
			seoTitle: orNull(input.seoTitle),
			seoDescription: orNull(input.seoDescription),
		}),
	);
	if (!updated.ok) return fail("slug-taken");
	if (!updated.value) return fail("not-found");
	return { ok: true, data: await toDetailDto(membership, updated.value) };
};

const contentSaveCheck =
	(membership: Membership, input: SavePageContentInput): ContentSaveCheck =>
	(latest) => {
		if (latest.version !== input.baseVersion) return "version-conflict";
		const locked = lockedBlocksIn(
			latest.content,
			input.content,
			featuresFor(membership.plan),
		);
		return locked.length > 0 ? "upgrade-required" : null;
	};

export const savePageContent = async (
	membership: Membership,
	userId: string,
	pageId: string,
	input: SavePageContentInput,
): Promise<Result<PageDetailDto>> => {
	if (membership.status !== "active") return fail("inactive");
	const saved = await insertNextVersion(
		membership.organizationId,
		pageId,
		input.content,
		userId,
		contentSaveCheck(membership, input),
	);
	if (!saved.ok) return fail(saved.error);
	return {
		ok: true,
		data: await toDetailDto(membership, saved.row, saved.saved),
	};
};

export const deletePage = async (
	membership: Membership,
	actor: ActivityActor,
	pageId: string,
): Promise<Result<null>> => {
	if (membership.status !== "active") return fail("inactive");
	const deleted = await deletePageRow(membership.organizationId, pageId);
	if (!deleted) return fail("not-found");
	await recordActivity(membership.organizationId, actor, {
		action: "page.deleted",
		details: { title: deleted.title },
	});
	return { ok: true, data: null };
};

const recordStatusChange = (
	membership: Membership,
	actor: ActivityActor,
	action: "page.published" | "page.unpublished",
	row: PageRow,
) =>
	recordActivity(membership.organizationId, actor, {
		action,
		details: { title: row.title },
	});

/** Always allowed: a page outside the plan's served set is published but not live. */
export const publishPage = async (
	membership: Membership,
	actor: ActivityActor,
	pageId: string,
	input: PageBaseVersionInput,
): Promise<Result<PageDetailDto>> => {
	if (membership.status !== "active") return fail("inactive");
	const published = await publishPageRow(
		membership.organizationId,
		pageId,
		input.baseVersion,
	);
	if (!published.ok) return fail(published.error);
	await recordStatusChange(membership, actor, "page.published", published.row);
	return { ok: true, data: await toDetailDto(membership, published.row) };
};

export const unpublishPage = async (
	membership: Membership,
	actor: ActivityActor,
	pageId: string,
): Promise<Result<PageDetailDto>> => {
	if (membership.status !== "active") return fail("inactive");
	const row = await unpublishPageRow(membership.organizationId, pageId);
	if (!row) return fail("not-found");
	await recordStatusChange(membership, actor, "page.unpublished", row);
	return { ok: true, data: await toDetailDto(membership, row) };
};

/** Drops unpublished changes; the restored content skips plan gating, since it was already published. */
export const discardDraft = async (
	membership: Membership,
	userId: string,
	pageId: string,
	input: PageBaseVersionInput,
): Promise<Result<PageDetailDto>> => {
	if (membership.status !== "active") return fail("inactive");
	const discarded = await discardDraftRow(
		membership.organizationId,
		pageId,
		input.baseVersion,
		userId,
	);
	if (!discarded.ok) return fail(discarded.error);
	return { ok: true, data: await toDetailDto(membership, discarded.row) };
};

/** Published and within the plan's page limit: the only pages the public may see. */
const isServed = async (
	organizationId: string,
	plan: PlanSlug | null,
	pageId: string,
) =>
	(await findServedPageIds(organizationId, limitsFor(plan).pages)).has(pageId);

/** The id of a page the public may see, or null; the same check as `getPublicPage`. */
export const findServedPageId = async (
	organizationId: string,
	plan: PlanSlug | null,
	pageSlug: string,
) => {
	const id = await findPublishedPageIdBySlug(organizationId, pageSlug);
	return id && (await isServed(organizationId, plan, id)) ? id : null;
};

/** Null for an unknown or inactive organization, a draft and a page over the plan's limit alike. */
const listsServices = (content: PageDocument) => {
	const { types } = blocksIn(content);
	return types.has("Services") || types.has("Booking");
};

export const getPublicPage = async (
	organizationSlug: string,
	pageSlug: string,
): Promise<PublicPageDto | null> => {
	const organization = await findPublicOrganizationPlan(organizationSlug);
	if (!organization) return null;
	const row = await findPublishedPageBySlug(organization.id, pageSlug);
	if (!row) return null;
	if (!(await isServed(organization.id, organization.plan, row.id)))
		return null;
	return {
		organization: {
			name: organization.name,
			slug: organization.slug,
			branding: organization.branding,
		},
		title: row.title,
		seoTitle: row.seoTitle ?? row.title,
		seoDescription: row.seoDescription ?? (organization.tagline || null),
		content: row.content,
		services: listsServices(row.content)
			? await listPublicServices(organization.id)
			: [],
	};
};

/** Stores the image under `pages/<orgId>/` and counts it against the plan's quota. Throws `ImageError`. */
export const uploadPageImage = async (
	membership: Membership,
	file: File,
): Promise<Result<PageImageDto>> => {
	if (membership.status !== "active") return fail("inactive");
	const { organizationId } = membership;
	const { bytes, type } = await validateImage(file);
	const key = `pages/${organizationId}/${crypto.randomUUID()}.${imageExtension(type)}`;
	const limit = limitsFor(membership.plan).pageImageBytes;
	let stored = false;
	try {
		const inserted = await insertPageImageWithinLimit(
			{ id: crypto.randomUUID(), organizationId, key, bytes: bytes.byteLength },
			limit,
			async () => {
				await storageClient.put(key, bytes, type);
				stored = true;
			},
		);
		if (!inserted) return fail("quota-exceeded");
		return {
			ok: true,
			data: { src: fileUrl(key), usage: { used: inserted.used, limit } },
		};
	} catch (error) {
		if (stored)
			await storageClient.delete(key).catch((deleteError: unknown) => {
				pagesLogger.warn("Failed to delete an untracked page image", {
					organizationId,
					key,
					error: deleteError,
				});
			});
		throw error;
	}
};

/** For the organization purge: best effort, as their rows go with the organization. */
export const deleteOrganizationPageImages = async (
	organizationIds: string[],
) => {
	for (const organizationId of organizationIds)
		await storageClient
			.deletePrefix(`pages/${organizationId}/`)
			.catch((error: unknown) => {
				pagesLogger.warn(
					"Failed to delete a purged organization's page images",
					{
						organizationId,
						error,
					},
				);
			});
};
