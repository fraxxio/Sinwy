import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { fileUrl, storageClient } from "@backend/infrastructure/storage";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import {
	organization,
	organizationTransfer,
} from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { countHeldSlots } from "@organizationsModule";
import {
	type ApiResponse,
	AUTH_ERROR_CODES,
	type OrganizationDeletionPreviewDto,
} from "@sinwy/shared";
import { registerUserRoutes } from "@userModule";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerAuthRoutes } from "../routes";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerUserRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

let orgId: string;
let owner: { userId: string; cookie: string };

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Doomed Co");
	owner = await createUserWithSession();
	await joinOrganization(orgId, owner.userId, "owner");
	await activateOrganization(orgId);
});

const deleteOrganization = (cookie: string, organizationId = orgId) =>
	fetch(new URL("/api/auth/organization/delete", base), {
		method: "POST",
		headers: { "content-type": "application/json", cookie },
		body: JSON.stringify({ organizationId }),
	});

const exists = async (organizationId = orgId) =>
	(
		await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.id, organizationId))
	).length > 0;

const deactivate = () =>
	db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(eq(organization.id, orgId));

const offerTransfer = async (status: "pending" | "accepted") => {
	const recipient = await createUserWithSession();
	await joinOrganization(orgId, recipient.userId, "admin");
	await db.insert(organizationTransfer).values({
		id: `transfer_${orgId}`,
		organizationId: orgId,
		fromUserId: owner.userId,
		toUserId: recipient.userId,
		status,
		expiresAt: new Date(Date.now() + 86_400_000),
	});
};

const codeOf = async (res: Response) =>
	((await res.json().catch(() => null)) as { code?: string } | null)?.code;

test.each([
	"admin",
	"staff",
])("%s can't delete, active or inactive", async (role) => {
	const other = await createUserWithSession();
	await joinOrganization(orgId, other.userId, role);

	expect((await deleteOrganization(other.cookie)).status).toBe(403);
	await deactivate();
	expect((await deleteOrganization(other.cookie)).status).toBe(403);
	expect(await exists()).toBe(true);
});

test("the owner deletes an active organization, freeing its slot", async () => {
	expect(await countHeldSlots(owner.userId)).toBe(1);

	expect((await deleteOrganization(owner.cookie)).status).toBe(200);

	expect(await exists()).toBe(false);
	expect(await countHeldSlots(owner.userId)).toBe(0);
});

test("the owner deletes an inactive organization", async () => {
	await deactivate();

	expect((await deleteOrganization(owner.cookie)).status).toBe(200);
	expect(await exists()).toBe(false);
});

test("deleting a draft frees nothing it didn't hold", async () => {
	const draftId = await insertOrganization("Draft Co");
	await joinOrganization(draftId, owner.userId, "owner");

	expect((await deleteOrganization(owner.cookie, draftId)).status).toBe(200);

	expect(await exists(draftId)).toBe(false);
	expect(await countHeldSlots(owner.userId)).toBe(1);
});

test("scheduled for deletion: even the owner is refused", async () => {
	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, orgId));

	const res = await deleteOrganization(owner.cookie);

	expect(res.status).toBe(403);
	expect(await codeOf(res)).toBe(AUTH_ERROR_CODES.ORGANIZATION_INACTIVE);
	expect(await exists()).toBe(true);
});

test("refused while a transfer waits on the recipient's checkout", async () => {
	await offerTransfer("accepted");

	const res = await deleteOrganization(owner.cookie);

	expect(res.status).toBe(409);
	expect(await exists()).toBe(true);
});

test("a pending transfer doesn't block deletion", async () => {
	await offerTransfer("pending");

	expect((await deleteOrganization(owner.cookie)).status).toBe(200);
	expect(await exists()).toBe(false);
});

test("the stored logo is deleted with the organization", async () => {
	const key = `logos/${orgId}/logo.png`;
	await storageClient.put(key, new Uint8Array([1]), "image/png");
	await db
		.update(organization)
		.set({ logo: fileUrl(key) })
		.where(eq(organization.id, orgId));

	expect((await deleteOrganization(owner.cookie)).status).toBe(200);

	expect((await storageClient.serve(key)).status).toBe(404);
});

const getPreview = (cookie: string) =>
	fetch(new URL(`/api/account/organizations/${orgId}/deletion-preview`, base), {
		headers: { cookie },
	});

test("the preview tells the owner about a transfer waiting on checkout", async () => {
	await deactivate();
	const before = await getPreview(owner.cookie);
	expect(before.status).toBe(200);
	expect(
		(await before.json()) as ApiResponse<OrganizationDeletionPreviewDto>,
	).toMatchObject({
		data: {
			upcomingBookings: 0,
			transferAwaitingCheckout: false,
			holdsSlot: false,
		},
	});

	await offerTransfer("accepted");
	const after = (await (
		await getPreview(owner.cookie)
	).json()) as ApiResponse<OrganizationDeletionPreviewDto>;
	expect(after).toMatchObject({ data: { transferAwaitingCheckout: true } });
});

test("only the owner gets the preview, and not once it's scheduled", async () => {
	const admin = await createUserWithSession();
	await joinOrganization(orgId, admin.userId, "admin");
	const outsider = await createUserWithSession();

	expect((await getPreview(admin.cookie)).status).toBe(404);
	expect((await getPreview(outsider.cookie)).status).toBe(404);

	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, orgId));
	expect((await getPreview(owner.cookie)).status).toBe(404);
});
