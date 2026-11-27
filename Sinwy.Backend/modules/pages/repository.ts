import db, { type Tx } from "@db";
import { page, pageContent, pageImage } from "@db/schema/pageSchema";
import type { PageDocument } from "@sinwy/shared";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	lt,
	notExists,
	sql,
	sum,
} from "drizzle-orm";

export type PageRow = typeof page.$inferSelect;
export type PageVersionRow = Pick<
	typeof pageContent.$inferSelect,
	"id" | "version" | "content" | "createdAt" | "updatedAt"
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
	updatedAt: pageContent.updatedAt,
};

/** How long one user's saves keep landing in the same draft checkpoint. */
const CHECKPOINT_WINDOW_MINUTES = 10;

/** Drizzle wraps the driver's error, so the Postgres fields sit on `cause`. */
export const isSlugClash = (error: unknown) => {
	const cause = (error as { cause?: Record<string, unknown> } | null)?.cause;
	return (
		(cause?.["errno"] === "23505" || cause?.["code"] === "23505") &&
		cause?.["constraint"] === SLUG_INDEX
	);
};

/** Locks the page row until the transaction ends, so saves, publish and discard see each other's versions. */
const lockPage = async (tx: Tx, organizationId: string, pageId: string) => {
	const [locked] = await tx
		.select({ publishedVersionId: page.publishedVersionId })
		.from(page)
		.where(byId(organizationId, pageId))
		.for("update");
	return locked ?? null;
};

const latestLockedVersion = async (tx: Tx, pageId: string) => {
	const latest = await latestVersionOf(tx, pageId);
	if (!latest) throw new Error(`Page ${pageId} has no content version`);
	return latest;
};

const touchPage = async (tx: Tx, pageId: string) => {
	const [row] = await tx
		.update(page)
		.set({ updatedAt: new Date() })
		.where(eq(page.id, pageId))
		.returning();
	if (!row) throw new Error(`Page ${pageId} vanished under its lock`);
	return row;
};

/** Serializes page creation and image uploads in one organization until the transaction ends. */
const lockOrganization = (tx: Tx, organizationId: string) =>
	tx.execute(sql`select pg_advisory_xact_lock(hashtext(${organizationId}))`);

export const findPages = (organizationId: string) =>
	db
		.select()
		.from(page)
		.where(eq(page.organizationId, organizationId))
		.orderBy(desc(page.updatedAt), asc(page.id));

export const findPageLabels = (organizationId: string, pageIds: string[]) =>
	pageIds.length === 0
		? Promise.resolve([])
		: db
				.select({ id: page.id, title: page.title, slug: page.slug })
				.from(page)
				.where(
					and(
						eq(page.organizationId, organizationId),
						inArray(page.id, pageIds),
					),
				);

export const findPage = async (organizationId: string, pageId: string) => {
	const [row] = await db
		.select()
		.from(page)
		.where(byId(organizationId, pageId));
	return row ?? null;
};

/** The published pages a plan serves: the oldest `limit` by creation, so republishing can't reorder them. */
const servedPages = (organizationId: string, limit: number) =>
	db
		.select({ id: page.id, slug: page.slug })
		.from(page)
		.where(
			and(
				eq(page.organizationId, organizationId),
				eq(page.status, "published"),
			),
		)
		.orderBy(asc(page.createdAt), asc(page.id))
		.limit(limit);

export const findServedPageIds = async (
	organizationId: string,
	limit: number,
) => {
	if (limit <= 0) return new Set<string>();
	const rows = await servedPages(organizationId, limit);
	return new Set(rows.map((row) => row.id));
};

/** The slug of each of `pageIds` the plan serves, by id; the same pages as `findServedPageIds`. */
export const findServedPageSlugs = async (
	organizationId: string,
	limit: number,
	pageIds: readonly string[],
) => {
	if (limit <= 0 || pageIds.length === 0) return new Map<string, string>();
	const served = servedPages(organizationId, limit).as("served");
	const rows = await db
		.select()
		.from(served)
		.where(inArray(served.id, [...pageIds]));
	return new Map(rows.map((row) => [row.id, row.slug]));
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

/** The pinned version's number, and whether the latest version holds the same content (an undo back to it). */
export const findPinnedVersion = async (
	pinnedVersionId: string,
	latestVersionId: string,
) => {
	const latestContent = db
		.select({ content: pageContent.content })
		.from(pageContent)
		.where(eq(pageContent.id, latestVersionId));
	const [row] = await db
		.select({
			version: pageContent.version,
			matchesLatest: sql<boolean>`${pageContent.content} = (${latestContent})`,
		})
		.from(pageContent)
		.where(eq(pageContent.id, pinnedVersionId));
	return row ?? null;
};

/** Counts and inserts under the organization lock, so two creates can't both take the last place. */
export const insertPageWithinLimit = (
	values: typeof page.$inferInsert & { organizationId: string },
	content: PageDocument,
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
 * Saves the next version when `check` passes. The latest row is updated in
 * place when it is an unpublished checkpoint the same user started within the
 * window; otherwise a new row is inserted. Either way `version` goes up.
 * Answers with the version it wrote, which a read after commit could miss.
 */
export const insertNextVersion = (
	organizationId: string,
	pageId: string,
	content: PageDocument,
	userId: string,
	check: ContentSaveCheck,
) =>
	db.transaction(async (tx) => {
		const locked = await lockPage(tx, organizationId, pageId);
		if (!locked) return { ok: false, error: "not-found" } as const;

		const latest = await latestLockedVersion(tx, pageId);
		const refused = check(latest);
		if (refused) return { ok: false, error: refused } as const;

		const version = latest.version + 1;
		const [updated] =
			latest.id === locked.publishedVersionId
				? []
				: await tx
						.update(pageContent)
						.set({ content, version, updatedAt: sql`now()` })
						.where(
							and(
								eq(pageContent.id, latest.id),
								eq(pageContent.createdByUserId, userId),
								sql`${pageContent.createdAt} > now() - make_interval(mins => ${CHECKPOINT_WINDOW_MINUTES})`,
							),
						)
						.returning(versionColumns);
		const [saved] = updated
			? [updated]
			: await tx
					.insert(pageContent)
					.values({
						id: crypto.randomUUID(),
						pageId,
						version,
						content,
						createdByUserId: userId,
					})
					.returning(versionColumns);
		if (!saved)
			throw new Error(`Page ${pageId} version insert returned no row`);
		return { ok: true, row: await touchPage(tx, pageId), saved } as const;
	});

/** The deleted page's title, or null when there was none. */
export const deletePage = async (organizationId: string, pageId: string) => {
	const [row] = await db
		.delete(page)
		.where(byId(organizationId, pageId))
		.returning({ title: page.title });
	return row ?? null;
};

/** Pins the latest version, refusing when it isn't the one the caller last saw. */
export const publishPage = (
	organizationId: string,
	pageId: string,
	baseVersion: number,
) =>
	db.transaction(async (tx) => {
		const locked = await lockPage(tx, organizationId, pageId);
		if (!locked) return { ok: false, error: "not-found" } as const;

		const latest = await latestLockedVersion(tx, pageId);
		if (latest.version !== baseVersion)
			return { ok: false, error: "version-conflict" } as const;
		const [row] = await tx
			.update(page)
			.set({
				status: "published",
				publishedAt: new Date(),
				publishedVersionId: latest.id,
			})
			.where(eq(page.id, pageId))
			.returning();
		if (!row) throw new Error(`Page ${pageId} vanished under its lock`);
		return { ok: true, row } as const;
	});

/**
 * Copies the pinned content into a new latest version and pins that, so the
 * draft is dropped without versions going backwards. The discarded draft stays
 * as a history row; `publishedAt` is left alone.
 */
export const discardDraft = (
	organizationId: string,
	pageId: string,
	baseVersion: number,
	userId: string,
) =>
	db.transaction(async (tx) => {
		const locked = await lockPage(tx, organizationId, pageId);
		if (!locked) return { ok: false, error: "not-found" } as const;
		const pinnedId = locked.publishedVersionId;
		if (!pinnedId) return { ok: false, error: "not-published" } as const;

		const latest = await latestLockedVersion(tx, pageId);
		if (latest.version !== baseVersion)
			return { ok: false, error: "version-conflict" } as const;

		if (latest.id !== pinnedId) {
			const [pinned] = await tx
				.select({ content: pageContent.content })
				.from(pageContent)
				.where(eq(pageContent.id, pinnedId));
			if (!pinned) throw new Error(`Page ${pageId} pins a missing version`);
			const id = crypto.randomUUID();
			await tx.insert(pageContent).values({
				id,
				pageId,
				version: latest.version + 1,
				content: pinned.content,
				createdByUserId: userId,
			});
			await tx
				.update(page)
				.set({ publishedVersionId: id, updatedAt: new Date() })
				.where(eq(page.id, pageId));
		}
		const [row] = await tx.select().from(page).where(eq(page.id, pageId));
		if (!row) throw new Error(`Page ${pageId} vanished under its lock`);
		return { ok: true, row } as const;
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

const pageImageBytesUsed = async (
	executor: Tx | typeof db,
	organizationId: string,
) => {
	const [row] = await executor
		.select({ bytes: sum(pageImage.bytes).mapWith(Number) })
		.from(pageImage)
		.where(eq(pageImage.organizationId, organizationId));
	return row?.bytes ?? 0;
};

export type PageImageInsert = Omit<typeof pageImage.$inferInsert, "createdAt">;

/** Under the organization lock: refuses (null) when the image would cross `limit`, else runs `store` and inserts the row. */
export const insertPageImageWithinLimit = (
	values: PageImageInsert,
	limit: number,
	store: () => Promise<void>,
) =>
	db.transaction(async (tx) => {
		await lockOrganization(tx, values.organizationId);
		const used = await pageImageBytesUsed(tx, values.organizationId);
		if (used + values.bytes > limit) return null;
		await store();
		await tx.insert(pageImage).values(values);
		return { used: used + values.bytes };
	});

/** Images created before `createdBefore` that no saved version of any page in their organization mentions, by id after `afterId`. */
export const findUnusedPageImages = (
	createdBefore: Date,
	afterId: string | null,
	limit: number,
) =>
	db
		.select({
			id: pageImage.id,
			organizationId: pageImage.organizationId,
			key: pageImage.key,
		})
		.from(pageImage)
		.where(
			and(
				lt(pageImage.createdAt, createdBefore),
				afterId === null ? undefined : gt(pageImage.id, afterId),
				notExists(
					db
						.select({ one: sql`1` })
						.from(pageContent)
						.innerJoin(page, eq(page.id, pageContent.pageId))
						.where(
							and(
								eq(page.organizationId, pageImage.organizationId),
								sql`strpos(${pageContent.content}::text, ${pageImage.key}) > 0`,
							),
						),
				),
			),
		)
		.orderBy(asc(pageImage.id))
		.limit(limit);

export const deletePageImages = (ids: string[]) =>
	db.delete(pageImage).where(inArray(pageImage.id, ids));
