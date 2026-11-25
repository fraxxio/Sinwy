import { beforeEach, expect, test } from "bun:test";
import { mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileUrl, storageClient } from "@backend/infrastructure/storage";
import { insertOrganization } from "@backend/test/helpers";
import appConfig from "@config";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { page, pageContent, pageImage } from "@db/schema/pageSchema";
import { emptyPageDocument, type PageDocument } from "@sinwy/shared";
import { eq } from "drizzle-orm";
import { sweepUnusedPageImages } from "../sweep";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-10-25T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

beforeEach(async () => {
	await db.delete(organization);
	await rm(resolve(appConfig.STORAGE_LOCAL_DIR, "pages"), {
		recursive: true,
		force: true,
	});
});

const storedFiles = (organizationId: string) =>
	readdir(resolve(appConfig.STORAGE_LOCAL_DIR, "pages", organizationId)).catch(
		() => [],
	);

const rowsOf = async (organizationId: string) =>
	(
		await db
			.select({ key: pageImage.key })
			.from(pageImage)
			.where(eq(pageImage.organizationId, organizationId))
	).map((row) => row.key.split("/").at(-1));

/** A stored and tracked image named `name`, uploaded `age` before `now`. */
const storeImage = async (
	organizationId: string,
	name: string,
	age: number,
) => {
	const key = `pages/${organizationId}/${name}.png`;
	await storageClient.put(key, new Uint8Array([1]), "image/png");
	await db.insert(pageImage).values({
		id: crypto.randomUUID(),
		organizationId,
		key,
		bytes: 1,
		createdAt: ago(age),
	});
	return fileUrl(key);
};

const documentWith = (...srcs: string[]): PageDocument => ({
	...emptyPageDocument(),
	data: {
		root: { props: {} },
		content: srcs.map((src, n) => ({
			type: "Image",
			props: { id: `image-${n}`, src, alt: "", aspect: "wide" },
		})),
	},
});

/** A page with one content row per document, in version order; `published` is the 1-based version that is live. */
const seedPage = async (
	organizationId: string,
	documents: PageDocument[],
	published?: number,
) => {
	const pageId = crypto.randomUUID();
	await db.insert(page).values({
		id: pageId,
		organizationId,
		slug: pageId,
		title: "Home",
	});
	const ids = [];
	for (const [n, content] of documents.entries()) {
		const id = crypto.randomUUID();
		await db
			.insert(pageContent)
			.values({ id, pageId, version: n + 1, content });
		ids.push(id);
	}
	if (published)
		await db
			.update(page)
			.set({ status: "published", publishedVersionId: ids[published - 1] })
			.where(eq(page.id, pageId));
	return pageId;
};

test("keeps images any saved version uses or that are young; deletes the rest, file and row", async () => {
	const orgId = await insertOrganization("Salon");
	const checkpoint = await storeImage(orgId, "checkpoint", 48 * HOUR);
	const discarded = await storeImage(orgId, "discarded", 48 * HOUR);
	const published = await storeImage(orgId, "published", 48 * HOUR);
	const latest = await storeImage(orgId, "latest", 48 * HOUR);
	await storeImage(orgId, "young", 23 * HOUR);
	await storeImage(orgId, "unused", 25 * HOUR);
	await seedPage(orgId, [
		documentWith(checkpoint),
		documentWith(),
		documentWith(latest),
	]);
	// a draft that was discarded back to the published version
	await seedPage(
		orgId,
		[documentWith(published), documentWith(discarded), documentWith(published)],
		1,
	);

	expect(await sweepUnusedPageImages(now)).toEqual({ deleted: 1, failed: 0 });

	const kept = ["checkpoint", "discarded", "latest", "published", "young"];
	expect((await rowsOf(orgId)).sort()).toEqual(kept.map((n) => `${n}.png`));
	expect((await storedFiles(orgId)).sort()).toEqual(
		kept.map((n) => `${n}.png`),
	);
	expect(await sweepUnusedPageImages(now)).toEqual({ deleted: 0, failed: 0 });
});

test("a deleted page's images are swept; another organization's page doesn't protect them", async () => {
	const orgId = await insertOrganization("Salon");
	const otherId = await insertOrganization("Other");
	const onDeleted = await storeImage(orgId, "on-deleted", 25 * HOUR);
	const elsewhere = await storeImage(orgId, "elsewhere", 25 * HOUR);
	const deletedPage = await seedPage(orgId, [documentWith(onDeleted)]);
	await db.delete(page).where(eq(page.id, deletedPage));
	await seedPage(otherId, [documentWith(elsewhere)]);

	expect(await sweepUnusedPageImages(now)).toEqual({ deleted: 2, failed: 0 });
	expect(await rowsOf(orgId)).toEqual([]);
	expect(await storedFiles(orgId)).toEqual([]);
});

test("a file that fails to delete keeps its row, and the next run retries it", async () => {
	const orgId = await insertOrganization("Salon");
	const key = `pages/${orgId}/stuck.png`;
	// unlink fails on a directory, standing in for a storage error
	await mkdir(resolve(appConfig.STORAGE_LOCAL_DIR, key), { recursive: true });
	await db.insert(pageImage).values({
		id: crypto.randomUUID(),
		organizationId: orgId,
		key,
		bytes: 1,
		createdAt: ago(25 * HOUR),
	});
	await storeImage(orgId, "unused", 25 * HOUR);

	expect(await sweepUnusedPageImages(now)).toEqual({ deleted: 1, failed: 1 });
	expect(await rowsOf(orgId)).toEqual(["stuck.png"]);

	await rm(resolve(appConfig.STORAGE_LOCAL_DIR, key), { recursive: true });
	expect(await sweepUnusedPageImages(now)).toEqual({ deleted: 1, failed: 0 });
	expect(await rowsOf(orgId)).toEqual([]);
});

test("sweeps in batches until none are left", async () => {
	const orgId = await insertOrganization("Salon");
	await db.insert(pageImage).values(
		Array.from({ length: 101 }, (_, n) => ({
			id: crypto.randomUUID(),
			organizationId: orgId,
			key: `pages/${orgId}/${n}.png`,
			bytes: 1,
			createdAt: ago(25 * HOUR),
		})),
	);

	expect(await sweepUnusedPageImages(now)).toEqual({
		deleted: 101,
		failed: 0,
	});
	expect(await rowsOf(orgId)).toEqual([]);
});
