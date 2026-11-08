import db, { type Tx } from "@db";
import { page, pageContent } from "@db/schema/pageSchema";
import type { PageContent } from "@sinwy/shared";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";

export type PageRow = typeof page.$inferSelect;
export type PageVersionRow = Pick<
	typeof pageContent.$inferSelect,
	"id" | "version" | "content" | "createdAt"
>;
type PageUpdate = {
	[K in "title" | "slug" | "seoTitle" | "seoDescription"]?:
		| PageRow[K]
		| undefined;
};

const SLUG_INDEX = "page_organization_slug_uidx";

const byId = (organizationId: string, pageId: string) =>
	and(eq(page.organizationId, organizationId), eq(page.id, pageId));

const versionColumns = {
	id: pageContent.id,
	version: pageContent.version,
	content: pageContent.content,
	createdAt: pageContent.createdAt,
};

/** Drizzle wraps the driver's error, so the Postgres fields sit on `cause`. */
export const isSlugClash = (error: unknown) => {
	const cause = (error as { cause?: Record<string, unknown> } | null)?.cause;
	return (
		(cause?.["errno"] === "23505" || cause?.["code"] === "23505") &&
		cause?.["constraint"] === SLUG_INDEX
	);
};

/** Serializes page creation in one organization until the transaction ends. */
const lockOrganization = (tx: Tx, organizationId: string) =>
	tx.execute(sql`select pg_advisory_xact_lock(hashtext(${organizationId}))`);

export const findPages = (organizationId: string) =>
	db
		.select()
		.from(page)
		.where(eq(page.organizationId, organizationId))
		.orderBy(desc(page.updatedAt), asc(page.id));

export const findPage = async (organizationId: string, pageId: string) => {
	const [row] = await db
		.select()
		.from(page)
		.where(byId(organizationId, pageId));
	return row ?? null;
};

/** The published pages a plan serves: the oldest `limit` by creation, so republishing can't reorder them. */
export const findServedPageIds = async (
	organizationId: string,
	limit: number,
) => {
	if (limit <= 0) return new Set<string>();
	const rows = await db
		.select({ id: page.id })
		.from(page)
		.where(
			and(
				eq(page.organizationId, organizationId),
				eq(page.status, "published"),
			),
		)
		.orderBy(asc(page.createdAt), asc(page.id))
		.limit(limit);
	return new Set(rows.map((row) => row.id));
};

const latestVersionOf = async (executor: Tx | typeof db, pageId: string) => {
	const [row] = await executor
		.select(versionColumns)
		.from(pageContent)
		.where(eq(pageContent.pageId, pageId))
		.orderBy(desc(pageContent.version))
		.limit(1);
	return row ?? null;
};

export const findLatestVersion = (pageId: string) =>
	latestVersionOf(db, pageId);

export const findVersionNumber = async (versionId: string) => {
	const [row] = await db
		.select({ version: pageContent.version })
		.from(pageContent)
		.where(eq(pageContent.id, versionId));
	return row?.version ?? null;
};

/** Counts and inserts under the organization lock, so two creates can't both take the last place. */
export const insertPageWithinLimit = (
	values: typeof page.$inferInsert & { organizationId: string },
	content: PageContent,
	createdByUserId: string,
	limit: number,
) =>
	db.transaction(async (tx) => {
		await lockOrganization(tx, values.organizationId);
		const [used] = await tx
			.select({ n: count() })
			.from(page)
			.where(eq(page.organizationId, values.organizationId));
		if ((used?.n ?? 0) >= limit) return null;

		const [row] = await tx.insert(page).values(values).returning();
		if (!row) throw new Error("Page insert returned no row");
		await tx.insert(pageContent).values({
			id: crypto.randomUUID(),
			pageId: row.id,
			version: 1,
			content,
			createdByUserId,
		});
		return row;
	});

export const updatePage = async (
	organizationId: string,
	pageId: string,
	values: PageUpdate,
) => {
	const [row] = await db
		.update(page)
		.set({ ...values, updatedAt: new Date() })
		.where(byId(organizationId, pageId))
		.returning();
	return row ?? null;
};

export type ContentSaveCheck = (
	latest: PageVersionRow,
) => "version-conflict" | "upgrade-required" | null;

/**
 * Locks the page row, so concurrent saves see each other's version, then
 * inserts the next version when `check` passes.
 */
export const insertNextVersion = (
	organizationId: string,
	pageId: string,
	content: PageContent,
	createdByUserId: string,
	check: ContentSaveCheck,
) =>
	db.transaction(async (tx) => {
		const [locked] = await tx
			.select({ id: page.id })
			.from(page)
			.where(byId(organizationId, pageId))
			.for("update");
		if (!locked) return { ok: false, error: "not-found" } as const;

		const latest = await latestVersionOf(tx, pageId);
		if (!latest) throw new Error(`Page ${pageId} has no content version`);
		const refused = check(latest);
		if (refused) return { ok: false, error: refused } as const;

		await tx.insert(pageContent).values({
			id: crypto.randomUUID(),
			pageId,
			version: latest.version + 1,
			content,
			createdByUserId,
		});
		await tx
			.update(page)
			.set({ updatedAt: new Date() })
			.where(eq(page.id, pageId));
		return { ok: true } as const;
	});

export const deletePage = async (organizationId: string, pageId: string) => {
	const rows = await db
		.delete(page)
		.where(byId(organizationId, pageId))
		.returning({ id: page.id });
	return rows.length > 0;
};

/** Pins the latest version under the page lock, so a concurrent save can't slip between reading and pinning it. */
export const publishPage = (organizationId: string, pageId: string) =>
	db.transaction(async (tx) => {
		const [locked] = await tx
			.select({ id: page.id })
			.from(page)
			.where(byId(organizationId, pageId))
			.for("update");
		if (!locked) return null;

		const latest = await latestVersionOf(tx, pageId);
		if (!latest) throw new Error(`Page ${pageId} has no content version`);
		const [row] = await tx
			.update(page)
			.set({
				status: "published",
				publishedAt: new Date(),
				publishedVersionId: latest.id,
			})
			.where(eq(page.id, pageId))
			.returning();
		return row ?? null;
	});

export const unpublishPage = async (organizationId: string, pageId: string) => {
	const [row] = await db
		.update(page)
		.set({ status: "draft", publishedAt: null, publishedVersionId: null })
		.where(byId(organizationId, pageId))
		.returning();
	return row ?? null;
};

/** A published page with its pinned content; never the draft. */
export const findPublishedPageIdBySlug = async (
	organizationId: string,
	slug: string,
) => {
	const [row] = await db
		.select({ id: page.id })
		.from(page)
		.where(
			and(
				eq(page.organizationId, organizationId),
				eq(page.slug, slug),
				eq(page.status, "published"),
			),
		);
	return row?.id ?? null;
};

export const findPublishedPageBySlug = async (
	organizationId: string,
	slug: string,
) => {
	const [row] = await db
		.select({
			id: page.id,
			title: page.title,
			seoTitle: page.seoTitle,
			seoDescription: page.seoDescription,
			content: pageContent.content,
		})
		.from(page)
		.innerJoin(pageContent, eq(pageContent.id, page.publishedVersionId))
		.where(
			and(
				eq(page.organizationId, organizationId),
				eq(page.slug, slug),
				eq(page.status, "published"),
			),
		);
	return row ?? null;
};
