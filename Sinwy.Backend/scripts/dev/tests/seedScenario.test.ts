import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import { polarCoreRequests, stubPolarCore } from "@backend/test/helpers";
import { registerBillingRoutes } from "@billingModule";
import db from "@db";
import { account } from "@db/schema/authSchema";
import {
	member,
	organization,
	organizationProfile,
} from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { registerOrganizationRoutes } from "@organizationsModule";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { loginAs } from "../loginAs";
import { type Scenario, seedScenario } from "../seedScenario";

let server: Server<never>;
let base: URL;
let polarSpy: ReturnType<typeof stubPolarCore>;
const customersCreated = () =>
	polarCoreRequests(polarSpy, "POST /v1/customers/").length;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerOrganizationRoutes(app);
	registerBillingRoutes(app);
	server = app.listen(0);
	base = server.url;

	// sign-up asks Polar for a customer; answer like the sandbox does for a new email
	polarSpy = stubPolarCore();
});

afterAll(() => {
	polarSpy.mockRestore();
	server.stop(true);
});

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	polarSpy.mockClear();
});

const seedAny = (scenario: Scenario) =>
	seedScenario({
		scenario,
		baseUrl: base,
		emailBase: "seed@seed-scenario.test",
		staffCount: 2,
	});

const seed = async (scenario: Exclude<Scenario, "user">) => {
	const { organization, ...result } = await seedAny(scenario);
	if (!organization) throw new Error(`${scenario} made no org`);
	return { ...result, organization };
};

const orgRow = async (id: string) => {
	const [row] = await db
		.select({
			status: organization.status,
			subscriptionStatusAt: organization.subscriptionStatusAt,
			onboardingCompletedAt: organization.onboardingCompletedAt,
		})
		.from(organization)
		.where(eq(organization.id, id));
	return row;
};

const roles = (organizationId: string) =>
	db
		.select({ userId: member.userId, role: member.role })
		.from(member)
		.where(eq(member.organizationId, organizationId));

test("user: a verified user with no org", async () => {
	const result = await seedAny("user");
	const [seeded] = result.users;
	if (!seeded) throw new Error("no user");

	expect(seeded.email).toMatch(
		/^seed\+seed-[0-9a-f]{8}-user@seed-scenario\.test$/,
	);
	expect("organization" in result).toBe(false);
	expect(
		await db
			.select({ id: member.id })
			.from(member)
			.where(eq(member.userId, seeded.userId)),
	).toEqual([]);
	expect((await loginAs({ email: seeded.email })).userId).toBe(seeded.userId);
});

test("owner-with-org: a verified owner with a credential account and an unpaid org", async () => {
	const result = await seed("owner-with-org");
	const [owner] = result.users;
	if (!owner) throw new Error("no owner");

	expect(owner.email).toMatch(
		/^seed\+seed-[0-9a-f]{8}-owner@seed-scenario\.test$/,
	);
	const [ownerRow] = await db
		.select({ emailVerified: user.emailVerified })
		.from(user)
		.where(eq(user.id, owner.userId));
	expect(ownerRow?.emailVerified).toBe(true);
	const [credential] = await db
		.select({ providerId: account.providerId })
		.from(account)
		.where(eq(account.userId, owner.userId));
	expect(credential?.providerId).toBe("credential");
	expect(customersCreated()).toBe(1);

	expect(await orgRow(result.organization.id)).toEqual({
		status: "inactive",
		subscriptionStatusAt: null,
		onboardingCompletedAt: null,
	});
	expect(await roles(result.organization.id)).toEqual([
		{ userId: owner.userId, role: "owner" },
	]);
});

test("subscribed-org: active through the webhook, onboarding done", async () => {
	const result = await seed("subscribed-org");

	const row = await orgRow(result.organization.id);
	expect(row?.status).toBe("active");
	expect(row?.subscriptionStatusAt).toBeInstanceOf(Date);
	expect(row?.onboardingCompletedAt).toBeInstanceOf(Date);
	const [profile] = await db
		.select({ country: organizationProfile.country })
		.from(organizationProfile)
		.where(eq(organizationProfile.organizationId, result.organization.id));
	expect(profile?.country).toBe("LT");
});

test("org-with-staff: staff members, and every printed email works with login-as", async () => {
	const result = await seed("org-with-staff");

	expect(result.users.map((u) => u.role)).toEqual(["owner", "staff", "staff"]);
	expect(
		(await roles(result.organization.id)).map((m) => m.role).sort(),
	).toEqual(["owner", "staff", "staff"]);
	expect(customersCreated()).toBe(3);

	for (const { email, userId } of result.users) {
		expect((await loginAs({ email })).userId).toBe(userId);
	}
});

test("each run creates new users", async () => {
	const first = await seed("owner-with-org");
	const second = await seed("owner-with-org");

	expect(second.users[0]?.email).not.toBe(first.users[0]?.email);
	expect(second.organization.id).not.toBe(first.organization.id);
});
