import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import createApp from "@backend/lib/app";
import {
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { invitation, organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import {
	type ApiResponse,
	type InvitationPreviewDto,
	invitationPreviewSchema,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerOrganizationRoutes } from "../routes";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerOrganizationRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

let orgId: string;
let ownerId: string;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Preview Co");
	({ userId: ownerId } = await createUserWithSession());
	await joinOrganization(orgId, ownerId, "owner");
});

const DAY = 86_400_000;
let seq = 0;

const seedInvitation = async (
	values: { status?: string; expiresAt?: Date; role?: string } = {},
) => {
	const id = `invitation_preview_${++seq}`;
	await db.insert(invitation).values({
		id,
		organizationId: orgId,
		email: "invitee@test.dev",
		role: values.role ?? "admin",
		status: values.status ?? "pending",
		expiresAt: values.expiresAt ?? new Date(Date.now() + DAY),
		createdAt: new Date(),
		inviterId: ownerId,
	});
	return id;
};

const preview = async (id: string) => {
	const res = await fetch(new URL(`/api/public/invitations/${id}`, base));
	return {
		status: res.status,
		body: (await res.json()) as ApiResponse<InvitationPreviewDto>,
	};
};

test("a pending invitation shows the organization, inviter and role without a session", async () => {
	const { status, body } = await preview(await seedInvitation());

	expect(status).toBe(200);
	expect(body.data).toEqual({
		status: "pending",
		organization: { name: "Preview Co", slug: orgId },
		inviterName: "Test User",
		role: "admin",
		email: "invitee@test.dev",
		expiresAt: expect.any(String),
	});
});

test("the preview carries nothing beyond the schema: no ids or other emails", async () => {
	const { body } = await preview(await seedInvitation());

	expect(invitationPreviewSchema.strict().safeParse(body.data).success).toBe(
		true,
	);
	const raw = JSON.stringify(body);
	expect(raw).not.toContain(ownerId);
	expect(raw).not.toContain(`${ownerId}@test.dev`);
});

test("a pending invitation past its expiry reads as expired", async () => {
	const id = await seedInvitation({ expiresAt: new Date(Date.now() - 1000) });
	const { status, body } = await preview(id);

	expect(status).toBe(200);
	expect(body.data?.status).toBe("expired");
});

test("unknown, canceled, rejected and accepted invitations all get the same 404", async () => {
	const ids = [
		"invitation_unknown",
		await seedInvitation({ status: "canceled" }),
		await seedInvitation({ status: "rejected" }),
		await seedInvitation({ status: "accepted" }),
	];
	const [first, ...rest] = await Promise.all(ids.map(preview));

	expect(first?.status).toBe(404);
	for (const response of rest) expect(response).toEqual(first as never);
});

test("an organization scheduled for deletion makes its invitation unavailable", async () => {
	const id = await seedInvitation();
	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, orgId));

	expect((await preview(id)).status).toBe(404);
});
