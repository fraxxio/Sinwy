import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	givePlan,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import {
	organization,
	organizationProfile,
} from "@db/schema/organizationSchema";
import { page, pageContent } from "@db/schema/pageSchema";
import { user } from "@db/schema/userSchema";
import {
	API_ERROR_CODES,
	type ApiResponse,
	type PageContent,
	type PageDetailDto,
	type PageListDto,
	type PlanSlug,
	type PublicPageDto,
} from "@sinwy/shared";
import type { Server } from "bun";
import { asc, eq } from "drizzle-orm";
import { MAX_PAGE_CONTENT_BYTES } from "../controller";
import { registerPageRoutes, registerPublicPageRoutes } from "../routes";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerPageRoutes(app);
	registerPublicPageRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

type Org = Awaited<ReturnType<typeof seedOrg>>;
let org: Org;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	org = await seedOrg("Salon");
});

const seedOrg = async (name: string, plan: PlanSlug = "starter") => {
	const orgId = await insertOrganization(name);
	const owner = await createUserWithSession();
	const staff = await createUserWithSession();
	await joinOrganization(orgId, owner.userId, "owner");
	await joinOrganization(orgId, staff.userId, "staff");
	await activateOrganization(orgId, plan);
	return {
		orgId,
		ownerId: owner.userId,
		ownerCookie: owner.cookie,
		staffCookie: staff.cookie,
	};
};

const call = (
	method: string,
	path: string,
	cookie = org.ownerCookie,
	body?: unknown,
	organizationId = org.orgId,
) =>
	fetch(new URL(`/api/organizations/${organizationId}/${path}`, base), {
		method,
		headers: { "content-type": "application/json", cookie },
		body:
			body === undefined
				? undefined
				: typeof body === "string"
					? body
					: JSON.stringify(body),
	});

const unwrap = async <T>(res: Response) => {
	const body = (await res.json()) as ApiResponse<T>;
	if (!body.isSuccess) throw new Error(`request failed: ${body.message}`);
	return body.data;
};

const codeOf = async (res: Response) =>
	((await res.json()) as ApiResponse<never>).code;

let slugSeq = 0;
const create = async (fields: Record<string, unknown> = {}) => {
	const res = await call("POST", "pages", org.ownerCookie, {
		templateId: "blank",
		title: "About us",
		slug: `page-${++slugSeq}`,
		...fields,
	});
	expect(res.status).toBe(201);
	return unwrap<PageDetailDto>(res);
};

const content = (...types: string[]): PageContent =>
	({
		schemaVersion: 1,
		blocks: types.map((type, n) => ({ id: `${type}-${n}`, type, props: {} })),
	}) as PageContent;

const save = (
	pageId: string,
	baseVersion: number,
	body: PageContent = content("heading"),
) =>
	call("PUT", `pages/${pageId}/content`, org.ownerCookie, {
		baseVersion,
		content: body,
	});

const setPlan = (plan: PlanSlug | null) => givePlan(org.ownerId, plan);

const publish = async (pageId: string) => {
	const res = await call("POST", `pages/${pageId}/publish`);
	expect(res.status).toBe(200);
	return unwrap<PageDetailDto>(res);
};

const readPublic = (pageSlug: string, organizationSlug = org.orgId) =>
	fetch(
		new URL(
			`/api/public/organizations/${organizationSlug}/pages/${pageSlug}`,
			base,
		),
	);

const publicStatus = async (pageSlug: string) =>
	(await readPublic(pageSlug)).status;

test("create: a page and version 1 built from the template and the profile", async () => {
	await db.insert(organizationProfile).values({
		organizationId: org.orgId,
		tagline: "Cuts since 1999",
	});

	const created = await create({ templateId: "about", slug: "about-us" });

	expect(created).toMatchObject({
		title: "About us",
		slug: "about-us",
		status: "draft",
		live: false,
		publishedAt: null,
		seoTitle: null,
		publishedVersion: null,
		hasUnpublishedChanges: false,
	});
	expect(created.latestVersion.version).toBe(1);
	expect(JSON.stringify(created.latestVersion.content)).toContain(
		"Cuts since 1999",
	);
	const versions = await db
		.select({ version: pageContent.version })
		.from(pageContent)
		.where(eq(pageContent.pageId, created.id));
	expect(versions).toEqual([{ version: 1 }]);
});

test("create: at the plan's limit → 409 PAGE_LIMIT_REACHED", async () => {
	await create();
	const res = await call("POST", "pages", org.ownerCookie, {
		templateId: "blank",
		title: "Second",
		slug: "second",
	});
	expect(res.status).toBe(409);
	expect(await codeOf(res)).toBe(API_ERROR_CODES.PAGE_LIMIT_REACHED);
});

test("create: two concurrent creates for the last place → exactly one succeeds", async () => {
	await setPlan("professional");
	for (let n = 0; n < 4; n++) await create();

	const attempts = await Promise.all(
		["last-a", "last-b"].map((slug) =>
			call("POST", "pages", org.ownerCookie, {
				templateId: "blank",
				title: slug,
				slug,
			}),
		),
	);
	expect(attempts.map((res) => res.status).sort()).toEqual([201, 409]);
	const rows = await db
		.select({ id: page.id })
		.from(page)
		.where(eq(page.organizationId, org.orgId));
	expect(rows).toHaveLength(5);
});

test("create: a premium template → 402 on Starter, 201 on Professional", async () => {
	const body = { templateId: "landing", title: "Landing", slug: "landing" };
	const refused = await call("POST", "pages", org.ownerCookie, body);
	expect(refused.status).toBe(402);
	expect(await codeOf(refused)).toBe(API_ERROR_CODES.PLAN_UPGRADE_REQUIRED);

	await setPlan("professional");
	expect((await call("POST", "pages", org.ownerCookie, body)).status).toBe(201);
});

test("slug: a clash on create or rename → 409 PAGE_SLUG_TAKEN; a reserved slug → 400", async () => {
	await setPlan("professional");
	await create({ slug: "about" });
	const other = await create({ slug: "team" });

	const clash = await call("POST", "pages", org.ownerCookie, {
		templateId: "blank",
		title: "Again",
		slug: "about",
	});
	expect(clash.status).toBe(409);
	expect(await codeOf(clash)).toBe(API_ERROR_CODES.PAGE_SLUG_TAKEN);

	const rename = await call("PATCH", `pages/${other.id}`, org.ownerCookie, {
		slug: "about",
	});
	expect(rename.status).toBe(409);
	expect(await codeOf(rename)).toBe(API_ERROR_CODES.PAGE_SLUG_TAKEN);

	const reserved = await call("POST", "pages", org.ownerCookie, {
		templateId: "blank",
		title: "Book",
		slug: "book",
	});
	expect(reserved.status).toBe(400);
});

test("the same slug is free in another organization", async () => {
	await create({ slug: "about" });
	const other = await seedOrg("Other");
	const res = await call(
		"POST",
		"pages",
		other.ownerCookie,
		{ templateId: "blank", title: "About", slug: "about" },
		other.orgId,
	);
	expect(res.status).toBe(201);
});

test("update: title, slug and SEO; empty SEO strings store null; updatedAt moves", async () => {
	const created = await create();
	await Bun.sleep(5);

	const saved = await unwrap<PageDetailDto>(
		await call("PATCH", `pages/${created.id}`, org.ownerCookie, {
			title: "Our story",
			slug: "our-story",
			seoTitle: "Our story | Salon",
			seoDescription: "  ",
		}),
	);
	expect(saved).toMatchObject({
		title: "Our story",
		slug: "our-story",
		seoTitle: "Our story | Salon",
		seoDescription: null,
	});
	expect(saved.updatedAt > created.updatedAt).toBe(true);

	const cleared = await unwrap<PageDetailDto>(
		await call("PATCH", `pages/${created.id}`, org.ownerCookie, {
			seoTitle: "",
		}),
	);
	expect(cleared.seoTitle).toBeNull();
	expect(cleared.title).toBe("Our story");
});

test("content: each save adds the next version and bumps updatedAt", async () => {
	const created = await create();
	await Bun.sleep(5);

	const res = await save(created.id, 1, content("heading", "text"));
	expect(res.status).toBe(200);
	const saved = await unwrap<PageDetailDto>(res);
	expect(saved.latestVersion.version).toBe(2);
	expect(saved.latestVersion.content.blocks.map((b) => b.type)).toEqual([
		"heading",
		"text",
	]);
	expect(saved.updatedAt > created.updatedAt).toBe(true);

	const versions = await db
		.select({ version: pageContent.version })
		.from(pageContent)
		.where(eq(pageContent.pageId, created.id))
		.orderBy(asc(pageContent.version));
	expect(versions).toEqual([{ version: 1 }, { version: 2 }]);
});

test("content: a stale baseVersion → 409 PAGE_VERSION_CONFLICT, and concurrent saves can't both win", async () => {
	const created = await create();
	expect((await save(created.id, 1)).status).toBe(200);

	const stale = await save(created.id, 1);
	expect(stale.status).toBe(409);
	expect(await codeOf(stale)).toBe(API_ERROR_CODES.PAGE_VERSION_CONFLICT);

	const racing = await Promise.all([save(created.id, 2), save(created.id, 2)]);
	expect(racing.map((res) => res.status).sort()).toEqual([200, 409]);
});

test("content: a new premium block → 402 on Starter; one the page already has → 200", async () => {
	const created = await create();
	const refused = await save(created.id, 1, content("heading", "gallery"));
	expect(refused.status).toBe(402);
	expect(await codeOf(refused)).toBe(API_ERROR_CODES.PLAN_UPGRADE_REQUIRED);

	await setPlan("professional");
	expect((await save(created.id, 1, content("gallery"))).status).toBe(200);

	await setPlan("starter");
	expect((await save(created.id, 2, content("gallery", "text"))).status).toBe(
		200,
	);
	expect(
		(await save(created.id, 3, content("gallery", "testimonials"))).status,
	).toBe(402);
});

test("content: unknown block types → 400; an oversized body → 413", async () => {
	const created = await create();
	const unknown = await save(created.id, 1, content("marquee"));
	expect(unknown.status).toBe(400);

	const huge = JSON.stringify({
		baseVersion: 1,
		content: {
			schemaVersion: 1,
			blocks: [
				{
					id: "text-1",
					type: "text",
					props: { text: "x".repeat(MAX_PAGE_CONTENT_BYTES) },
				},
			],
		},
	});
	const tooLarge = await call(
		"PUT",
		`pages/${created.id}/content`,
		org.ownerCookie,
		huge,
	);
	expect(tooLarge.status).toBe(413);
});

test("list: usage, newest edit first, and only the oldest published pages within the limit are live", async () => {
	await setPlan("professional");
	const first = await create({ title: "First" });
	const second = await create({ title: "Second" });
	const draft = await create({ title: "Draft" });
	await publish(second.id);
	await publish(first.id);
	await Bun.sleep(5);
	await call("PATCH", `pages/${first.id}`, org.ownerCookie, { title: "1st" });

	const list = await unwrap<PageListDto>(await call("GET", "pages"));
	expect(list.usage).toEqual({ used: 3, limit: 5 });
	expect(list.items[0]?.id).toBe(first.id);
	const live = (id: string) => list.items.find((item) => item.id === id)?.live;
	expect([live(first.id), live(second.id), live(draft.id)]).toEqual([
		true,
		true,
		false,
	]);

	await setPlan("starter");
	const downgraded = await unwrap<PageListDto>(await call("GET", "pages"));
	expect(downgraded.usage).toEqual({ used: 3, limit: 1 });
	expect(
		downgraded.items.filter((item) => item.live).map((item) => item.id),
	).toEqual([first.id]);
	const detail = await unwrap<PageDetailDto>(
		await call("GET", `pages/${second.id}`),
	);
	expect(detail).toMatchObject({ status: "published", live: false });
});

test("delete: the page and its versions go, and the place frees up", async () => {
	const created = await create();
	await save(created.id, 1);

	const res = await call("DELETE", `pages/${created.id}`);
	expect(res.status).toBe(200);
	expect(
		await db
			.select()
			.from(pageContent)
			.where(eq(pageContent.pageId, created.id)),
	).toHaveLength(0);
	expect((await call("GET", `pages/${created.id}`)).status).toBe(404);
	await create();
});

const versionsOf = (pageId: string) =>
	db
		.select({ id: pageContent.id })
		.from(pageContent)
		.where(eq(pageContent.pageId, pageId));

test("delete: a published page and its pinned version go, and the public address stops answering", async () => {
	const created = await create({ slug: "welcome" });
	await publish(created.id);

	expect((await call("DELETE", `pages/${created.id}`)).status).toBe(200);
	expect(await versionsOf(created.id)).toHaveLength(0);
	expect(await publicStatus("welcome")).toBe(404);
});

test("deleting the organization removes its pages and every version; another organization's stay", async () => {
	await setPlan("professional");
	const published = await create();
	await publish(published.id);
	await save(published.id, 1);
	const draft = await create();
	const other = await seedOrg("Other", "professional");
	const kept = await unwrap<PageDetailDto>(
		await call(
			"POST",
			"pages",
			other.ownerCookie,
			{ templateId: "blank", title: "Kept", slug: "kept" },
			other.orgId,
		),
	);

	await db.delete(organization).where(eq(organization.id, org.orgId));

	expect(
		await db.select().from(page).where(eq(page.organizationId, org.orgId)),
	).toHaveLength(0);
	expect(await versionsOf(published.id)).toHaveLength(0);
	expect(await versionsOf(draft.id)).toHaveLength(0);
	expect(await versionsOf(kept.id)).toHaveLength(1);
});

test("deleting the user who saved a version keeps the version, without an author", async () => {
	const editor = await createUserWithSession();
	await joinOrganization(org.orgId, editor.userId, "admin");
	const created = await create();
	expect(
		(
			await call("PUT", `pages/${created.id}/content`, editor.cookie, {
				baseVersion: 1,
				content: content("heading"),
			})
		).status,
	).toBe(200);

	await db.delete(user).where(eq(user.id, editor.userId));

	const versions = await db
		.select({
			version: pageContent.version,
			author: pageContent.createdByUserId,
		})
		.from(pageContent)
		.where(eq(pageContent.pageId, created.id))
		.orderBy(asc(pageContent.version));
	expect(versions).toEqual([
		{ version: 1, author: org.ownerId },
		{ version: 2, author: null },
	]);
});

test("staff: reads answer, writes → 403", async () => {
	const created = await create();
	const writes = [
		call("POST", "pages", org.staffCookie, {
			templateId: "blank",
			title: "Staff",
			slug: "staff",
		}),
		call("PATCH", `pages/${created.id}`, org.staffCookie, { title: "x" }),
		call("PUT", `pages/${created.id}/content`, org.staffCookie, {
			baseVersion: 1,
			content: content("text"),
		}),
		call("DELETE", `pages/${created.id}`, org.staffCookie),
		call("POST", `pages/${created.id}/publish`, org.staffCookie),
		call("POST", `pages/${created.id}/unpublish`, org.staffCookie),
	];
	for (const res of await Promise.all(writes)) expect(res.status).toBe(403);

	const list = await unwrap<PageListDto>(
		await call("GET", "pages", org.staffCookie),
	);
	expect(list.usage).toEqual({ used: 1, limit: 1 });
	expect(
		(await call("GET", `pages/${created.id}`, org.staffCookie)).status,
	).toBe(200);
});

test("inactive organization: writes → 409 ORGANIZATION_INACTIVE, reads answer with a limit of 0", async () => {
	const created = await create();
	await publish(created.id);
	await db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(eq(organization.id, org.orgId));

	const writes = [
		call("POST", "pages", org.ownerCookie, {
			templateId: "blank",
			title: "New",
			slug: "new",
		}),
		call("PATCH", `pages/${created.id}`, org.ownerCookie, { title: "x" }),
		save(created.id, 1),
		call("DELETE", `pages/${created.id}`),
		call("POST", `pages/${created.id}/publish`),
		call("POST", `pages/${created.id}/unpublish`),
	];
	for (const res of await Promise.all(writes)) {
		expect(res.status).toBe(409);
		expect(await codeOf(res)).toBe(API_ERROR_CODES.ORGANIZATION_INACTIVE);
	}

	const list = await unwrap<PageListDto>(await call("GET", "pages"));
	expect(list.usage).toEqual({ used: 1, limit: 0 });
	expect(list.items[0]).toMatchObject({ status: "published", live: false });
	expect((await call("GET", `pages/${created.id}`)).status).toBe(200);
});

test("another organization's page id → 404 on every route", async () => {
	const other = await seedOrg("Other");
	const foreign = await unwrap<PageDetailDto>(
		await call(
			"POST",
			"pages",
			other.ownerCookie,
			{ templateId: "blank", title: "Theirs", slug: "theirs" },
			other.orgId,
		),
	);

	const attempts = [
		call("GET", `pages/${foreign.id}`),
		call("PATCH", `pages/${foreign.id}`, org.ownerCookie, { title: "Mine" }),
		save(foreign.id, 1),
		call("POST", `pages/${foreign.id}/publish`),
		call("POST", `pages/${foreign.id}/unpublish`),
		call("DELETE", `pages/${foreign.id}`),
	];
	for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);

	const [row] = await db
		.select({ title: page.title, status: page.status })
		.from(page)
		.where(eq(page.id, foreign.id));
	expect(row).toEqual({ title: "Theirs", status: "draft" });
	expect(
		await db
			.select()
			.from(pageContent)
			.where(eq(pageContent.pageId, foreign.id)),
	).toHaveLength(1);
});

test("publish: pins the latest version; later saves stay off the public page until the next publish", async () => {
	await db.insert(organizationProfile).values({
		organizationId: org.orgId,
		tagline: "Cuts since 1999",
	});
	const created = await create({ title: "Welcome", slug: "welcome" });
	expect(await publicStatus("welcome")).toBe(404);

	const published = await publish(created.id);
	expect(published).toMatchObject({
		status: "published",
		live: true,
		publishedVersion: 1,
		hasUnpublishedChanges: false,
	});
	expect(published.publishedAt).not.toBeNull();
	const first = await unwrap<PublicPageDto>(await readPublic("welcome"));
	expect(first).toEqual({
		organization: { name: "Salon", slug: org.orgId },
		title: "Welcome",
		seoTitle: "Welcome",
		seoDescription: "Cuts since 1999",
		content: published.latestVersion.content,
	});

	const saved = await unwrap<PageDetailDto>(
		await save(created.id, 1, content("heading", "text")),
	);
	expect(saved).toMatchObject({
		publishedVersion: 1,
		hasUnpublishedChanges: true,
	});
	await call("PATCH", `pages/${created.id}`, org.ownerCookie, {
		seoTitle: "Welcome to the salon",
		seoDescription: "Book a cut",
	});
	const unchanged = await unwrap<PublicPageDto>(await readPublic("welcome"));
	expect(unchanged.content).toEqual(first.content);
	expect(unchanged).toMatchObject({
		seoTitle: "Welcome to the salon",
		seoDescription: "Book a cut",
	});

	const republished = await publish(created.id);
	expect(republished).toMatchObject({
		publishedVersion: 2,
		hasUnpublishedChanges: false,
	});
	expect(
		(await unwrap<PublicPageDto>(await readPublic("welcome"))).content,
	).toEqual(content("heading", "text"));
});

test("unpublish: back to a draft with no pin, gone from the public endpoint, not live in the list", async () => {
	const created = await create({ slug: "gone" });
	await publish(created.id);

	const res = await call("POST", `pages/${created.id}/unpublish`);
	expect(res.status).toBe(200);
	expect(await unwrap<PageDetailDto>(res)).toMatchObject({
		status: "draft",
		live: false,
		publishedAt: null,
		publishedVersion: null,
	});
	const [row] = await db
		.select({ versionId: page.publishedVersionId })
		.from(page)
		.where(eq(page.id, created.id));
	expect(row?.versionId).toBeNull();
	expect(await publicStatus("gone")).toBe(404);
	const list = await unwrap<PageListDto>(await call("GET", "pages"));
	expect(list.items[0]).toMatchObject({ status: "draft", live: false });
});

test("public: an ended plan or a scheduled deletion hides the page; restoring serves it again with no page change", async () => {
	const created = await create({ slug: "home" });
	await publish(created.id);
	const before = await db.select().from(page).where(eq(page.id, created.id));
	expect(await publicStatus("home")).toBe(200);

	await setPlan(null);
	expect(await publicStatus("home")).toBe(404);
	await setPlan("starter");
	expect(await publicStatus("home")).toBe(200);

	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, org.orgId));
	expect(await publicStatus("home")).toBe(404);
	await db
		.update(organization)
		.set({ deletionScheduledAt: null })
		.where(eq(organization.id, org.orgId));
	expect(await publicStatus("home")).toBe(200);

	expect(await db.select().from(page).where(eq(page.id, created.id))).toEqual(
		before,
	);
});

test("public: after a downgrade only the oldest published pages by creation are served, whatever the publish order", async () => {
	await setPlan("professional");
	const a = await create({ slug: "a" });
	const b = await create({ slug: "b" });
	const c = await create({ slug: "c" });
	for (const created of [c, b, a]) await publish(created.id);
	for (const slug of ["a", "b", "c"])
		expect(await publicStatus(slug)).toBe(200);

	await setPlan("starter");
	expect(await publicStatus("a")).toBe(200);
	expect(await publicStatus("b")).toBe(404);
	expect(await publicStatus("c")).toBe(404);

	const republished = await publish(b.id);
	expect(republished).toMatchObject({ status: "published", live: false });
	expect(await publicStatus("b")).toBe(404);
	expect(await publicStatus("a")).toBe(200);
});

test("public: unknown organization, unknown page, draft, inactive and over-limit all give the same 404", async () => {
	await setPlan("professional");
	const draft = await create({ slug: "draft" });
	const first = await create({ slug: "first" });
	const second = await create({ slug: "second" });
	await publish(first.id);
	await publish(second.id);
	await setPlan("starter");
	const other = await seedOrg("Other");
	const theirs = await unwrap<PageDetailDto>(
		await call(
			"POST",
			"pages",
			other.ownerCookie,
			{ templateId: "blank", title: "Theirs", slug: "theirs" },
			other.orgId,
		),
	);
	const publishTheirs = await call(
		"POST",
		`pages/${theirs.id}/publish`,
		other.ownerCookie,
		undefined,
		other.orgId,
	);
	expect(publishTheirs.status).toBe(200);
	expect((await readPublic("theirs", other.orgId)).status).toBe(200);
	await db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(eq(organization.id, other.orgId));

	const misses = [
		readPublic("first", "no-such-org"),
		readPublic("missing"),
		readPublic(draft.slug),
		readPublic("second"),
		readPublic("theirs", other.orgId),
	];
	const bodies = new Set<string>();
	for (const res of await Promise.all(misses)) {
		expect(res.status).toBe(404);
		bodies.add(await res.text());
	}
	expect(bodies.size).toBe(1);
});
