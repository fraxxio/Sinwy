import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { registerAuthRoutes } from "@authModule";
import { keyFromFileUrl } from "@backend/infrastructure/storage";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import appConfig from "@config";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { pageImage } from "@db/schema/pageSchema";
import { user } from "@db/schema/userSchema";
import { registerFileRoutes } from "@filesModule";
import {
	API_ERROR_CODES,
	type ApiResponse,
	IMAGE_UPLOAD_LIMITS,
	isSafeImageSrc,
	type PageImageDto,
	PLAN_LIMITS,
	type PlanSlug,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerPageRoutes } from "../routes";

let server: Server<never>;
let base: URL;

const PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);

const png = (bytes = PNG) =>
	new File([bytes], "photo.png", { type: "image/png" });

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerPageRoutes(app);
	registerFileRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

type Org = Awaited<ReturnType<typeof seedOrg>>;
let org: Org;

const seedOrg = async (name: string, plan: PlanSlug | null = "starter") => {
	const orgId = await insertOrganization(name);
	const owner = await createUserWithSession();
	const staff = await createUserWithSession();
	await joinOrganization(orgId, owner.userId, "owner");
	await joinOrganization(orgId, staff.userId, "staff");
	if (plan) await activateOrganization(orgId, plan);
	return { orgId, ownerCookie: owner.cookie, staffCookie: staff.cookie };
};

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	org = await seedOrg("Salon");
});

const upload = (
	file: File | null,
	cookie = org.ownerCookie,
	organizationId = org.orgId,
) => {
	const form = new FormData();
	if (file) form.set("file", file);
	return fetch(
		new URL(`/api/organizations/${organizationId}/page-images`, base),
		{ method: "POST", headers: { cookie }, body: form },
	);
};

const body = async (res: Response) =>
	(await res.json()) as ApiResponse<PageImageDto>;

const rowsOf = (organizationId: string) =>
	db
		.select({ key: pageImage.key, bytes: pageImage.bytes })
		.from(pageImage)
		.where(eq(pageImage.organizationId, organizationId));

const storedFiles = (organizationId: string) =>
	readdir(resolve(appConfig.STORAGE_LOCAL_DIR, "pages", organizationId)).catch(
		() => [],
	);

/** Tracks images totalling `bytes` without storing files, as if uploaded earlier. */
const fillQuota = (organizationId: string, bytes: number) =>
	db.insert(pageImage).values({
		id: crypto.randomUUID(),
		organizationId,
		key: `pages/${organizationId}/earlier-${crypto.randomUUID()}.jpg`,
		bytes,
	});

test("upload: stores the image under the organization, tracks its bytes and serves it", async () => {
	const res = await upload(png());
	expect(res.status).toBe(201);
	const result = await body(res);
	if (!result.isSuccess) throw new Error(result.message);

	const { src, usage } = result.data;
	expect(isSafeImageSrc(src)).toBe(true);
	const key = keyFromFileUrl(src);
	expect(key).toMatch(new RegExp(`^pages/${org.orgId}/[\\w-]+\\.png$`));
	expect(usage).toEqual({
		used: PNG.byteLength,
		limit: PLAN_LIMITS.starter.pageImageBytes,
	});
	expect(await rowsOf(org.orgId)).toEqual([
		{ key: key as string, bytes: PNG.byteLength },
	]);

	const served = await fetch(new URL(new URL(src).pathname, base));
	expect(served.status).toBe(200);
	expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);
});

test("quota: an upload that would cross the plan's limit → 409, naming the limit, and nothing is stored", async () => {
	const limit = PLAN_LIMITS.starter.pageImageBytes;
	await fillQuota(org.orgId, limit - PNG.byteLength + 1);

	const res = await upload(png());
	expect(res.status).toBe(409);
	const result = await body(res);
	expect(result.code).toBe(API_ERROR_CODES.PAGE_IMAGE_QUOTA_EXCEEDED);
	expect(result.message).toContain("100 MB");
	expect(result.message).toContain("within a day");
	expect(await rowsOf(org.orgId)).toHaveLength(1);
	expect(await storedFiles(org.orgId)).toEqual([]);
});

test("quota: an upload that exactly fills the limit passes", async () => {
	await fillQuota(
		org.orgId,
		PLAN_LIMITS.starter.pageImageBytes - PNG.byteLength,
	);
	expect((await upload(png())).status).toBe(201);
});

test("quota: two concurrent uploads for the last space → exactly one passes", async () => {
	await fillQuota(
		org.orgId,
		PLAN_LIMITS.starter.pageImageBytes - PNG.byteLength - 1,
	);

	const statuses = (await Promise.all([upload(png()), upload(png())]))
		.map((res) => res.status)
		.sort();
	expect(statuses).toEqual([201, 409]);
	expect(await rowsOf(org.orgId)).toHaveLength(2);
	expect(await storedFiles(org.orgId)).toHaveLength(1);
});

test("quota: other organizations' images don't count", async () => {
	const other = await seedOrg("Other");
	await fillQuota(other.orgId, PLAN_LIMITS.starter.pageImageBytes);
	expect((await upload(png())).status).toBe(201);
});

test("staff → 403, a member of another organization → 404, a no-plan organization → 409 ORGANIZATION_INACTIVE", async () => {
	expect((await upload(png(), org.staffCookie)).status).toBe(403);

	const other = await seedOrg("Other");
	expect((await upload(png(), other.ownerCookie)).status).toBe(404);

	const inactive = await seedOrg("Inactive", null);
	const res = await upload(png(), inactive.ownerCookie, inactive.orgId);
	expect(res.status).toBe(409);
	expect((await body(res)).code).toBe(API_ERROR_CODES.ORGANIZATION_INACTIVE);

	for (const id of [org.orgId, inactive.orgId]) {
		expect(await rowsOf(id)).toEqual([]);
		expect(await storedFiles(id)).toEqual([]);
	}
});

test("missing file, non-image bytes, a wrong type or an oversize file are refused before anything is written", async () => {
	const tooBig = new Uint8Array(IMAGE_UPLOAD_LIMITS.maxBytes + 1);
	tooBig.set(PNG);
	const cases: [File | null, number][] = [
		[null, 400],
		[new File(["hello"], "notes.png", { type: "image/png" }), 400],
		[new File(["hello"], "notes.txt", { type: "text/plain" }), 400],
		[new File([PNG], "photo.gif", { type: "image/gif" }), 400],
		[png(tooBig), 413],
	];
	for (const [file, status] of cases)
		expect((await upload(file)).status).toBe(status);

	expect(await rowsOf(org.orgId)).toEqual([]);
	expect(await storedFiles(org.orgId)).toEqual([]);
});

test("deleting the organization removes its image rows", async () => {
	expect((await upload(png())).status).toBe(201);
	await db.delete(organization).where(eq(organization.id, org.orgId));
	expect(await rowsOf(org.orgId)).toEqual([]);
});
