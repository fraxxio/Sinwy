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
import { service } from "@db/schema/serviceSchema";
import { user } from "@db/schema/userSchema";
import {
	API_ERROR_CODES,
	type ApiResponse,
	emptyPageDocument,
	normalizeRichText,
	PAGE_DOCUMENT_LIMITS,
	type PageDetailDto,
	type PageListDto,
	type PlanSlug,
	type PublicPageDto,
} from "@sinwy/shared";
import type { Server } from "bun";
import { and, asc, eq, sql } from "drizzle-orm";
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

const messageOf = async (res: Response) =>
	((await res.json()) as ApiResponse<never>).message;

let slugSeq = 0;
const create = async (fields: Record<string, unknown> = {}) => {
	const res = await call("POST", "pages", org.ownerCookie, {
		title: "About us",
		slug: `page-${++slugSeq}`,
		...fields,
	});
	expect(res.status).toBe(201);
	return unwrap<PageDetailDto>(res);
};

let blockSeq = 0;
const block = (type: string, props: Record<string, unknown> = {}) => ({
	type,
	props: { id: `${type}-${++blockSeq}`, ...props },
});

const document = (...content: unknown[]) => ({
	schemaVersion: 2,
	data: { root: { props: {} }, content },
});

const section = (...items: unknown[]) => block("Section", { items });

const headingPage = (text = "Welcome") =>
	document(section(block("Heading", { text })));

const save = (
	pageId: string,
	baseVersion: number,
	body: unknown = headingPage(),
) =>
	call("PUT", `pages/${pageId}/content`, org.ownerCookie, {
		baseVersion,
		content: body,
	});

const versionsOf = (pageId: string) =>
	db
		.select({ id: pageContent.id })
		.from(pageContent)
		.where(eq(pageContent.pageId, pageId));

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

test("create: a page and an empty version 1", async () => {
	const created = await create({ slug: "about-us" });

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
	const versions = await db
		.select({ version: pageContent.version, content: pageContent.content })
		.from(pageContent)
		.where(eq(pageContent.pageId, created.id));
	expect(versions).toEqual([{ version: 1, content: emptyPageDocument() }]);
});

test("create: at the plan's limit → 409 PAGE_LIMIT_REACHED", async () => {
	await create();
	const res = await call("POST", "pages", org.ownerCookie, {
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

test("slug: a clash on create or rename → 409 PAGE_SLUG_TAKEN; a reserved slug → 400", async () => {
	await setPlan("professional");
	await create({ slug: "about" });
	const other = await create({ slug: "team" });

	const clash = await call("POST", "pages", org.ownerCookie, {
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
		{ title: "About", slug: "about" },
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

const MESSY_TEXT =
	'<div><b>Walk-ins</b> welcome<script>x()</script><a href="https://maps.example" onclick="x()">Find us</a></div>';

test("content: each save stores the parsed document as the next version, rich text normalised, and bumps updatedAt", async () => {
	const created = await create();
	await Bun.sleep(5);

	const body = document(
		section(
			block("Heading", { text: "Studio Lumi" }),
			block("RichText", { content: MESSY_TEXT }),
		),
	);
	const res = await save(created.id, 1, body);
	expect(res.status).toBe(200);
	const saved = await unwrap<PageDetailDto>(res);
	expect(saved.latestVersion.version).toBe(2);
	expect(saved.updatedAt > created.updatedAt).toBe(true);

	const versions = await db
		.select({ version: pageContent.version, content: pageContent.content })
		.from(pageContent)
		.where(eq(pageContent.pageId, created.id))
		.orderBy(asc(pageContent.version));
	expect(versions.map((row) => row.version)).toEqual([1, 2]);
	const stored = versions[1]?.content;
	expect(stored).toEqual(saved.latestVersion.content);
	const items = stored?.data.content[0]?.props["items"] as {
		type: string;
		props: Record<string, unknown>;
	}[];
	expect(items.map((item) => item.type)).toEqual(["Heading", "RichText"]);
	const richText = items[1]?.props["content"];
	expect(richText).toBe(normalizeRichText(MESSY_TEXT));
	expect(richText).not.toContain("script");
	expect(richText).not.toContain("onclick");
	expect(richText).toContain("<strong>Walk-ins</strong>");
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

const nestedSections = (depth: number): unknown =>
	depth === 1
		? section(block("Heading", { text: "Deep" }))
		: section(nestedSections(depth - 1));

test("content: an invalid document → 400 naming the block, and no version is written", async () => {
	const created = await create();
	const refusals: [string, unknown][] = [
		["Marquee", document(block("Marquee"))],
		["Hero", document(section(block("Hero")))],
		[
			"Button",
			document(
				section(block("Button", { label: "Go", href: "javascript:alert(1)" })),
			),
		],
		["Heading", document(section(block("Heading", { size: "9" })))],
		["Section", document(nestedSections(PAGE_DOCUMENT_LIMITS.maxDepth + 1))],
	];
	for (const [name, body] of refusals) {
		const res = await save(created.id, 1, body);
		expect(res.status).toBe(400);
		expect(await messageOf(res)).toContain(name);
	}
	expect(await versionsOf(created.id)).toHaveLength(1);
});

test("content: an oversized body → 413, and no version is written", async () => {
	const created = await create();
	const huge = JSON.stringify({
		baseVersion: 1,
		content: document(
			section(
				block("RichText", {
					content: `<p>${"x".repeat(PAGE_DOCUMENT_LIMITS.maxBytes)}</p>`,
				}),
			),
		),
	});
	const tooLarge = await call(
		"PUT",
		`pages/${created.id}/content`,
		org.ownerCookie,
		huge,
	);
	expect(tooLarge.status).toBe(413);
	expect(await versionsOf(created.id)).toHaveLength(1);
});

test("the page document migration empties v1 and spike rows; versions and the published pointer stay", async () => {
	await setPlan("professional");
	const v1Page = await create({ slug: "v1-page" });
	const spikePage = await create({ slug: "spike-page" });
	await save(spikePage.id, 1);
	await publish(v1Page.id);
	await publish(spikePage.id);

	const setContent = (pageId: string, version: number, content: unknown) =>
		db
			.update(pageContent)
			.set({ content: content as never })
			.where(
				and(eq(pageContent.pageId, pageId), eq(pageContent.version, version)),
			);
	await setContent(v1Page.id, 1, {
		schemaVersion: 1,
		widgets: [{ id: "h", type: "heading", props: { text: "Hi" } }],
	});
	await setContent(spikePage.id, 2, {
		schemaVersion: 2,
		data: {
			root: { props: { radius: "medium" } },
			zones: {},
			content: [{ type: "BookingWidget", props: { id: "b", serviceIds: [] } }],
		},
	});

	const migration = await Bun.file(
		new URL("../../../drizzle/0033_page_document_reset.sql", import.meta.url),
	).text();
	await db.execute(sql.raw(migration));

	const rows = await db
		.select({
			pageId: pageContent.pageId,
			version: pageContent.version,
			content: pageContent.content,
		})
		.from(pageContent)
		.where(sql`${pageContent.pageId} in (${v1Page.id}, ${spikePage.id})`)
		.orderBy(asc(pageContent.pageId), asc(pageContent.version));
	expect(rows).toHaveLength(3);
	for (const row of rows) expect(row.content).toEqual(emptyPageDocument());

	for (const slug of ["v1-page", "spike-page"]) {
		const live = await unwrap<PublicPageDto>(await readPublic(slug));
		expect(live.content).toEqual(emptyPageDocument());
	}
	const spike = await unwrap<PageDetailDto>(
		await call("GET", `pages/${spikePage.id}`),
	);
	expect(spike).toMatchObject({ publishedVersion: 2, status: "published" });
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
			{ title: "Kept", slug: "kept" },
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
				content: headingPage(),
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
			title: "Staff",
			slug: "staff",
		}),
		call("PATCH", `pages/${created.id}`, org.staffCookie, { title: "x" }),
		call("PUT", `pages/${created.id}/content`, org.staffCookie, {
			baseVersion: 1,
			content: headingPage(),
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
			{ title: "Theirs", slug: "theirs" },
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
		organization: {
			name: "Salon",
			slug: org.orgId,
			branding: { color: null, font: null },
		},
		title: "Welcome",
		seoTitle: "Welcome",
		seoDescription: "Cuts since 1999",
		content: emptyPageDocument(),
		services: [],
	});

	const saved = await unwrap<PageDetailDto>(await save(created.id, 1));
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
	).toEqual(saved.latestVersion.content);
});

const insertService = (name: string, isActive = true) =>
	db.insert(service).values({
		id: crypto.randomUUID(),
		organizationId: org.orgId,
		name,
		slug: name.toLowerCase(),
		durationMinutes: 30,
		priceMinor: 2500,
		currency: "EUR",
		isActive,
	});

test("public: the organization's active services come with a page that has a Services block, and only then", async () => {
	await setPlan("professional");
	await insertService("Haircut");
	await insertService("Retired", false);
	const withServices = await create({ slug: "services" });
	await save(
		withServices.id,
		1,
		document(section(block("Heading")), block("Services")),
	);
	await publish(withServices.id);
	const plain = await create({ slug: "plain" });
	await save(plain.id, 1);
	await publish(plain.id);

	const served = await unwrap<PublicPageDto>(await readPublic("services"));
	expect(served.services.map((s) => s.name)).toEqual(["Haircut"]);
	expect(served.services[0]).toMatchObject({
		durationMinutes: 30,
		priceMinor: 2500,
		currency: "EUR",
	});
	const without = await unwrap<PublicPageDto>(await readPublic("plain"));
	expect(without.services).toEqual([]);
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
			{ title: "Theirs", slug: "theirs" },
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
