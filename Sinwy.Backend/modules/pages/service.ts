import type { Membership } from "@authModule";
import {
	findPublicOrganizationPlan,
	getOrganizationProfile,
} from "@organizationsModule";
import {
	BLOCK_TYPES,
	blockTypesIn,
	type CreatePageInput,
	hasFeature,
	limitsFor,
	PAGE_TEMPLATES,
	type PageDetailDto,
	type PageListDto,
	type PageListItemDto,
	type PageStatus,
	type PublicPageDto,
	type SavePageContentInput,
	type UpdatePageInput,
} from "@sinwy/shared";
import {
	type ContentSaveCheck,
	deletePage as deletePageRow,
	findLatestVersion,
	findPage,
	findPages,
	findPublishedPageBySlug,
	findServedPageIds,
	findVersionNumber,
	insertNextVersion,
	insertPageWithinLimit,
	isSlugClash,
	type PageRow,
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
	| "version-conflict";

type Result<T> = { ok: true; data: T } | { ok: false; error: PageError };

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

const toDetailDto = async (
	membership: Membership,
	row: PageRow,
): Promise<PageDetailDto> => {
	const [served, latest, publishedVersion] = await Promise.all([
		servedPageIds(membership),
		findLatestVersion(row.id),
		row.publishedVersionId ? findVersionNumber(row.publishedVersionId) : null,
	]);
	if (!latest) throw new Error(`Page ${row.id} has no content version`);
	return {
		...toListItemDto(row, served),
		seoTitle: row.seoTitle,
		seoDescription: row.seoDescription,
		createdAt: row.createdAt.toISOString(),
		latestVersion: {
			version: latest.version,
			content: latest.content,
			createdAt: latest.createdAt.toISOString(),
		},
		publishedVersion,
		hasUnpublishedChanges:
			row.status === "published" && publishedVersion !== latest.version,
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
	const template = PAGE_TEMPLATES[input.templateId];
	if (template.requires && !hasFeature(membership.plan, template.requires))
		return fail("upgrade-required");

	const { organizationId } = membership;
	const content = template.build(await getOrganizationProfile(organizationId));
	const inserted = await slugTaken(() =>
		insertPageWithinLimit(
			{
				id: crypto.randomUUID(),
				organizationId,
				title: input.title,
				slug: input.slug,
			},
			content,
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

/** A premium block the plan lacks may stay if the latest version already has it, so downgraded pages remain editable. */
const contentSaveCheck =
	(membership: Membership, input: SavePageContentInput): ContentSaveCheck =>
	(latest) => {
		if (latest.version !== input.baseVersion) return "version-conflict";
		const existing = blockTypesIn(latest.content);
		for (const type of blockTypesIn(input.content)) {
			const requires = BLOCK_TYPES[type].requires;
			if (
				requires &&
				!existing.has(type) &&
				!hasFeature(membership.plan, requires)
			)
				return "upgrade-required";
		}
		return null;
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
	return getPage(membership, pageId);
};

export const deletePage = async (
	membership: Membership,
	pageId: string,
): Promise<Result<null>> => {
	if (membership.status !== "active") return fail("inactive");
	return (await deletePageRow(membership.organizationId, pageId))
		? { ok: true, data: null }
		: fail("not-found");
};

const changeStatus =
	(write: typeof publishPageRow) =>
	async (
		membership: Membership,
		pageId: string,
	): Promise<Result<PageDetailDto>> => {
		if (membership.status !== "active") return fail("inactive");
		const row = await write(membership.organizationId, pageId);
		return row
			? { ok: true, data: await toDetailDto(membership, row) }
			: fail("not-found");
	};

/** Always allowed: a page outside the plan's served set is published but not live. */
export const publishPage = changeStatus(publishPageRow);

export const unpublishPage = changeStatus(unpublishPageRow);

/** Null for an unknown or inactive organization, a draft and a page over the plan's limit alike. */
export const getPublicPage = async (
	organizationSlug: string,
	pageSlug: string,
): Promise<PublicPageDto | null> => {
	const organization = await findPublicOrganizationPlan(organizationSlug);
	if (!organization) return null;
	const row = await findPublishedPageBySlug(organization.id, pageSlug);
	if (!row) return null;
	const served = await findServedPageIds(
		organization.id,
		limitsFor(organization.plan).pages,
	);
	if (!served.has(row.id)) return null;
	return {
		organization: { name: organization.name, slug: organization.slug },
		title: row.title,
		seoTitle: row.seoTitle ?? row.title,
		seoDescription: row.seoDescription ?? (organization.tagline || null),
		content: row.content,
	};
};
