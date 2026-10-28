import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	expect,
	spyOn,
	test,
} from "bun:test";
import { registerAuthRoutes } from "@authModule";
import { readOutboxEmails } from "@backend/infrastructure/email";
import {
	PolarApiErrors,
	type PolarModels,
	polarClient,
	productIdFor,
} from "@backend/infrastructure/polar";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	givePlan,
	holdSlot,
	insertOrganization,
	joinOrganization,
	polarCoreRequests,
	polarPages,
	stubPolarCore,
} from "@backend/test/helpers";
import db from "@db";
import {
	organization,
	organizationTransfer,
} from "@db/schema/organizationSchema";
import { user, userSubscription } from "@db/schema/userSchema";
import {
	getOrganizationState,
	registerOrganizationRoutes,
} from "@organizationsModule";
import {
	PolarClientError,
	PolarNetworkError,
	PolarServerError,
} from "@polar-sh/sdk";
import {
	type AccountSubscriptionDto,
	API_ERROR_CODES,
	type ApiResponse,
	AUTH_ERROR_CODES,
	type InvoiceListDto,
	type PlanSlug,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { applySubscriptionEvent } from "../projection";
import { findUserSubscription } from "../repository";
import { registerBillingRoutes } from "../routes";
import { revokeAccountSubscriptions } from "../service";

type Order = PolarModels.Order;
type Subscription = PolarModels.Subscription;

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerBillingRoutes(app);
	registerOrganizationRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

// Polar methods a test reaches must be stubbed; an unstubbed one calls the
// real sandbox. A stub without a value rejects, so a regression fails here.
const spies: ReturnType<typeof spyOn>[] = [];
const stub = <T extends object>(target: T, method: keyof T & string) => {
	const spy = spyOn(target, method as never) as ReturnType<typeof spyOn>;
	spy.mockImplementation(() =>
		Promise.reject(new Error("unexpected Polar call")),
	);
	spies.push(spy);
	return spy;
};

let listSubscriptions: ReturnType<typeof spyOn>;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	listSubscriptions = stub(
		polarClient.subscriptions,
		"iterList",
	).mockImplementation(polarPages());
});

afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
});

const request = (
	path: string,
	cookie?: string,
	init: { method?: string; body?: unknown } = {},
) =>
	fetch(new URL(path, base), {
		method: init.method ?? "GET",
		headers: {
			"content-type": "application/json",
			...(cookie ? { cookie } : {}),
		},
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});

const unwrap = async <T>(res: Response) => {
	const body = (await res.json()) as ApiResponse<T>;
	if (!body.isSuccess) throw new Error(`request failed: ${body.message}`);
	return body.data;
};

// the user each test org's subscription belongs to
const ownerOf = new Map<string, string>();

/** An org owned by the caller, whose account the billing routes act on. */
const seedOrg = async () => {
	const organizationId = await insertOrganization("Acme");
	const { userId, cookie } = await createUserWithSession();
	await joinOrganization(organizationId, userId, "owner");
	ownerOf.set(organizationId, userId);
	return { organizationId, userId, cookie };
};

const owner = (organizationId: string) => {
	const userId = ownerOf.get(organizationId);
	if (!userId) throw new Error("Seed the org with seedOrg");
	return userId;
};

type SubscriptionState = {
	status: "active" | "inactive";
	plan: PlanSlug | null;
	subscriptionId: string | null;
};

/** The org's derived status, with its owner's projected plan and binding. */
const getSubscriptionState = async (
	organizationId: string,
): Promise<SubscriptionState | null> => {
	const state = await getOrganizationState(organizationId);
	const [row] = await db
		.select({ subscriptionId: userSubscription.subscriptionId })
		.from(userSubscription)
		.where(eq(userSubscription.userId, owner(organizationId)));
	return (
		state && {
			status: state.status,
			plan: state.status === "active" ? state.ownerPlan : null,
			subscriptionId: row?.subscriptionId ?? null,
		}
	);
};

const setStatusAt = (organizationId: string, at: Date) =>
	db
		.update(userSubscription)
		.set({ subscriptionStatusAt: at })
		.where(eq(userSubscription.userId, owner(organizationId)));

const subscription = (
	organizationId: string,
	overrides: Partial<Subscription> = {},
) =>
	({
		id: `sub_${organizationId}`,
		status: "active",
		product_id: productIdFor("professional"),
		customer: { external_id: ownerOf.get(organizationId) },
		metadata: {},
		amount: 4900,
		currency: "eur",
		recurring_interval: "month",
		recurring_interval_count: 1,
		created_at: "2026-09-22T10:00:00Z",
		modified_at: "2026-09-22T10:00:00Z",
		current_period_end: "2026-10-22T10:00:00Z",
		cancel_at_period_end: false,
		ends_at: null,
		pause_at_period_end: false,
		resumes_at: null,
		pending_update: null,
		...overrides,
	}) as Subscription;

const polarServerError = () =>
	new PolarServerError(500, "customer@example.com");

// GET /status

test("GET status: member → { status }; non-member → 404; no session → 401", async () => {
	const { organizationId } = await seedOrg();
	const { userId, cookie } = await createUserWithSession();
	await joinOrganization(organizationId, userId, "staff");
	const outsider = await createUserWithSession();

	expect(
		await unwrap<{ status: string }>(
			await request(`/api/organizations/${organizationId}/status`, cookie),
		),
	).toEqual({ status: "inactive" });
	expect(
		(
			await request(
				`/api/organizations/${organizationId}/status`,
				outsider.cookie,
			)
		).status,
	).toBe(404);
	expect(
		(await request(`/api/organizations/${organizationId}/status`)).status,
	).toBe(401);
});

test("GET status: org holding a slot whose owner's plan webhook never landed → active, self-healed with its plan", async () => {
	const { organizationId, cookie } = await seedOrg();
	await holdSlot(organizationId);
	listSubscriptions.mockImplementation(
		polarPages([subscription(organizationId)]),
	);

	expect(
		await unwrap<{ status: string }>(
			await request(`/api/organizations/${organizationId}/status`, cookie),
		),
	).toEqual({ status: "active" });
	expect((await getSubscriptionState(organizationId))?.plan).toBe(
		"professional",
	);
});

test("GET status: active orgs, orgs without a slot and non-members never reach for Polar", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId);
	const outsider = await createUserWithSession();
	const inactive = await seedOrg();
	await holdSlot(inactive.organizationId);
	const draft = await seedOrg();

	await request(`/api/organizations/${organizationId}/status`, cookie);
	await request(
		`/api/organizations/${inactive.organizationId}/status`,
		outsider.cookie,
	);
	await request(
		`/api/organizations/${draft.organizationId}/status`,
		draft.cookie,
	);
	expect(listSubscriptions).not.toHaveBeenCalled();
});

test("billing responses are never cached, refusals included", async () => {
	const { organizationId, cookie } = await seedOrg();

	for (const [path, as] of [
		[`/api/organizations/${organizationId}/status`, cookie],
		["/api/account/subscription", cookie],
		["/api/account/invoices", undefined],
	] as const) {
		const res = await request(path, as);
		expect(res.headers.get("cache-control")).toBe("no-store");
	}
});

test("no session → 401 on every account billing route", async () => {
	const routes = [
		["GET", "subscription"],
		["POST", "subscription/plan"],
		["POST", "subscription/suspend"],
		["POST", "subscription/unsuspend"],
		["POST", "subscription/resume"],
		["POST", "subscription/cancel"],
		["POST", "subscription/uncancel"],
		["GET", "invoices"],
		["GET", "invoices/order_1/download"],
	] as const;
	for (const [method, path] of routes) {
		const body = method === "POST" ? { plan: "enterprise" } : undefined;
		expect(
			(await request(`/api/account/${path}`, undefined, { method, body }))
				.status,
		).toBe(401);
	}
});

test("the old organization billing routes are gone", async () => {
	const { organizationId, cookie } = await seedOrg();
	for (const path of ["subscription", "subscription/plan", "invoices"])
		expect(
			(await request(`/api/organizations/${organizationId}/${path}`, cookie))
				.status,
		).toBe(404);
});

// GET /subscription

test("GET subscription: no plan → no plan, no slots, no billing", async () => {
	const { cookie } = await seedOrg();
	const get = stub(polarClient.subscriptions, "get");

	expect(
		await unwrap<AccountSubscriptionDto>(
			await request("/api/account/subscription", cookie),
		),
	).toEqual({
		plan: null,
		suspended: false,
		organizationLimit: 0,
		activeOrganizations: [],
		billing: null,
		pendingChange: null,
		blockers: { suspend: "inactive", cancel: "inactive" },
	});
	expect(get).not.toHaveBeenCalled();
});

test("GET subscription: a plan → its cap, the slots in use and live billing details", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	const get = stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { cancel_at_period_end: true }),
	);

	const dto = await unwrap<AccountSubscriptionDto>(
		await request("/api/account/subscription", cookie),
	);

	expect(get).toHaveBeenCalledWith(`sub_${organizationId}`);
	expect(dto).toEqual({
		plan: "professional",
		suspended: false,
		organizationLimit: 2,
		activeOrganizations: [{ id: organizationId, name: "Acme" }],
		billing: {
			subscriptionStatus: "active",
			amount: 4900,
			currency: "eur",
			interval: "month",
			intervalCount: 1,
			currentPeriodEnd: "2026-10-22T10:00:00Z",
			cancelAtPeriodEnd: true,
			endsAt: null,
			pauseAtPeriodEnd: false,
			resumesAt: null,
		},
		pendingChange: null,
		blockers: { suspend: "cancel-pending", cancel: "cancel-pending" },
	});
});

test.each([
	["active", {}, { suspend: null, cancel: null }],
	["trialing", { status: "trialing" }, { suspend: "trialing", cancel: null }],
	["past due", { status: "past_due" }, { suspend: "past-due", cancel: null }],
	[
		"set to suspend",
		{ pause_at_period_end: true },
		{ suspend: "pause-pending", cancel: "pause-pending" },
	],
] as const)("GET subscription: %s → the blockers the suspend and cancel routes would answer", async (_, overrides, blockers) => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, overrides),
	);

	const dto = await unwrap<AccountSubscriptionDto>(
		await request("/api/account/subscription", cookie),
	);

	expect(dto.blockers).toEqual(blockers);
});

test("GET subscription: Polar down → blockers say billing is unavailable", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockRejectedValue(
		new Error("polar down"),
	);

	const dto = await unwrap<AccountSubscriptionDto>(
		await request("/api/account/subscription", cookie),
	);

	expect(dto.blockers).toEqual({
		suspend: "unavailable",
		cancel: "unavailable",
	});
});

test("GET subscription: Polar down → projection still served, billing null", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "enterprise");
	const get = stub(polarClient.subscriptions, "get").mockRejectedValue(
		new Error("polar down"),
	);

	const res = await request("/api/account/subscription", cookie);
	expect(get).toHaveBeenCalledWith(`sub_${organizationId}`);
	expect(res.status).toBe(200);
	const dto = await unwrap<AccountSubscriptionDto>(res);
	expect(dto.plan).toBe("enterprise");
	expect(dto.billing).toBeNull();
});

test("GET subscription: multi-month interval keeps its count", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { recurring_interval_count: 3 }),
	);

	const dto = await unwrap<AccountSubscriptionDto>(
		await request("/api/account/subscription", cookie),
	);
	expect(dto.billing).toMatchObject({ interval: "month", intervalCount: 3 });
});

test("GET subscription: a Polar status we don't know → billing null, not entitled like in a webhook", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { status: "frozen" as never }),
	);

	const dto = await unwrap<AccountSubscriptionDto>(
		await request("/api/account/subscription", cookie),
	);
	expect(dto).toMatchObject({ plan: null, billing: null });
});

test("GET subscription: a paused subscription → inactive, billing reports the pause", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { status: "paused" }),
	);

	const dto = await unwrap<AccountSubscriptionDto>(
		await request("/api/account/subscription", cookie),
	);
	expect(dto).toMatchObject({ plan: null, suspended: true });
	expect(dto.billing?.subscriptionStatus).toBe("paused");
});

test("GET subscription: a revocation whose webhook never landed is applied", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, {
			status: "canceled",
			ends_at: "2026-10-01T10:00:00Z",
		}),
	);

	const dto = await unwrap<AccountSubscriptionDto>(
		await request("/api/account/subscription", cookie),
	);

	expect(dto).toMatchObject({
		plan: null,
		activeOrganizations: [{ id: organizationId, name: "Acme" }],
	});
	expect(dto.billing?.subscriptionStatus).toBe("canceled");
	expect(await getSubscriptionState(organizationId)).toEqual({
		status: "inactive",
		plan: null,
		subscriptionId: null,
	});
});

test("GET subscription: Polar state older than the applied one changes nothing", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	await setStatusAt(organizationId, new Date("2026-10-01T00:00:00Z"));
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, {
			status: "canceled",
			modified_at: "2026-09-30T00:00:00Z",
		}),
	);

	const dto = await unwrap<AccountSubscriptionDto>(
		await request("/api/account/subscription", cookie),
	);

	expect(dto).toMatchObject({ plan: "professional" });
	expect((await getSubscriptionState(organizationId))?.status).toBe("active");
});

// POST /subscription/plan

// plan changes read the subscription first, to refuse one about to pause
const polarHasStarter = (organizationId: string) =>
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { product_id: productIdFor("starter") }),
	);

const changePlan = (cookie: string, body: unknown) =>
	request("/api/account/subscription/plan", cookie, {
		method: "POST",
		body,
	});

test("POST plan: invalid body → 400, no plan → 409, same plan → 400", async () => {
	const { organizationId, cookie } = await seedOrg();
	const update = stub(polarClient.subscriptions, "update");

	expect((await changePlan(cookie, { plan: "gold" })).status).toBe(400);
	const inactive = await changePlan(cookie, {
		plan: "enterprise",
	});
	expect(inactive.status).toBe(409);
	expect(((await inactive.json()) as ApiResponse).code).toBe(
		API_ERROR_CODES.PLAN_REQUIRED,
	);

	await activateOrganization(organizationId, "enterprise");
	expect((await changePlan(cookie, { plan: "enterprise" })).status).toBe(400);
	expect(update).not.toHaveBeenCalled();
});

test("POST plan: switches the product with next-invoice proration and applies it at once", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "starter");
	polarHasStarter(organizationId);
	// the webhook that activated the starter plan
	await setStatusAt(organizationId, new Date("2026-09-22T10:00:00Z"));
	const update = stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(organizationId, {
			product_id: productIdFor("enterprise"),
			amount: 9900,
			modified_at: "2026-09-30T10:00:00Z",
		}),
	);

	const res = await changePlan(cookie, { plan: "enterprise" });

	expect(res.status).toBe(200);
	expect(update).toHaveBeenCalledWith(`sub_${organizationId}`, {
		product_id: productIdFor("enterprise"),
		proration_behavior: "prorate",
	});
	const dto = await unwrap<AccountSubscriptionDto>(res);
	expect(dto.plan).toBe("enterprise");
	expect(dto.organizationLimit).toBe(5);
	expect(dto.billing).toMatchObject({
		subscriptionStatus: "active",
		amount: 9900,
		interval: "month",
	});
	expect((await getSubscriptionState(organizationId))?.plan).toBe("enterprise");
});

test("POST plan: applies Polar's state even when Polar's clock is ahead of ours", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "starter");
	polarHasStarter(organizationId);
	const polarNow = new Date(Date.now() + 3_600_000);
	await setStatusAt(organizationId, polarNow);
	stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(organizationId, {
			product_id: productIdFor("enterprise"),
			modified_at: new Date(polarNow.getTime() + 1000).toISOString(),
		}),
	);

	const dto = await unwrap<AccountSubscriptionDto>(
		await changePlan(cookie, { plan: "enterprise" }),
	);
	expect(dto.plan).toBe("enterprise");
	expect((await getSubscriptionState(organizationId))?.plan).toBe("enterprise");
});

test("POST plan: unexpected Polar errors → 422 refused or 502 unavailable, plan unchanged", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "starter");
	const update = stub(polarClient.subscriptions, "update");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { product_id: productIdFor("starter") }),
	);

	for (const [error, status] of [
		[
			new PolarApiErrors.ResourceNotFound(404, {
				error: "ResourceNotFound",
				detail: "Not found",
			}),
			422,
		],
		[polarServerError(), 502],
		[new PolarNetworkError("The operation timed out."), 502],
	] as const) {
		update.mockRejectedValue(error);
		const res = await changePlan(cookie, {
			plan: "enterprise",
		});
		expect(res.status).toBe(status);
		expect(((await res.json()) as ApiResponse).message).not.toContain(
			"customer@example.com",
		);
	}
	expect((await getSubscriptionState(organizationId))?.plan).toBe("starter");
});

test("POST plan: Polar refuses because it is already on the product (double submit, retry) → 200, applied", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "starter");
	stub(polarClient.subscriptions, "update").mockRejectedValue(
		new PolarClientError(422, "Unprocessable"),
	);
	const get = stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { product_id: productIdFor("enterprise") }),
	);

	const res = await changePlan(cookie, { plan: "enterprise" });

	expect(res.status).toBe(200);
	expect(get).toHaveBeenCalledWith(`sub_${organizationId}`);
	expect((await unwrap<AccountSubscriptionDto>(res)).plan).toBe("enterprise");
	expect((await getSubscriptionState(organizationId))?.plan).toBe("enterprise");
});

test("POST plan: canceled subscription → 409, plan unchanged", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "starter");
	polarHasStarter(organizationId);
	stub(polarClient.subscriptions, "update").mockRejectedValue(
		new PolarApiErrors.SubscriptionsUpdate403Error(403, {
			error: "AlreadyCanceledSubscription",
			detail: "canceled",
		}),
	);

	const canceled = await changePlan(cookie, {
		plan: "enterprise",
	});
	expect(canceled.status).toBe(409);
	expect(((await canceled.json()) as ApiResponse).code).toBe(409);
	expect((await getSubscriptionState(organizationId))?.plan).toBe("starter");
});

test("POST plan: subscription locked by another update → 409, plan unchanged", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "starter");
	polarHasStarter(organizationId);
	stub(polarClient.subscriptions, "update").mockRejectedValue(
		new PolarApiErrors.SubscriptionsUpdate409Error(409, {
			error: "SubscriptionLocked",
			detail: "locked",
		}),
	);

	expect((await changePlan(cookie, { plan: "enterprise" })).status).toBe(409);
	expect((await getSubscriptionState(organizationId))?.plan).toBe("starter");
});

test("POST plan: suspended org → 409 with its own code, Polar not asked", async () => {
	const { organizationId, cookie } = await seedOrg();
	await suspendInDb(organizationId);
	const get = stub(polarClient.subscriptions, "get");
	const update = stub(polarClient.subscriptions, "update");

	const res = await changePlan(cookie, { plan: "enterprise" });

	expect(res.status).toBe(409);
	expect(await codeOf(res)).toBe(API_ERROR_CODES.PLAN_SUSPENDED);
	expect(get).not.toHaveBeenCalled();
	expect(update).not.toHaveBeenCalled();
});

test("POST plan: suspension pending → 409 with its own code, plan unchanged", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "starter");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, {
			product_id: productIdFor("starter"),
			pause_at_period_end: true,
		}),
	);
	const update = stub(polarClient.subscriptions, "update");

	const res = await changePlan(cookie, { plan: "enterprise" });

	expect(res.status).toBe(409);
	expect(await codeOf(res)).toBe(API_ERROR_CODES.SUSPENSION_PENDING);
	expect(update).not.toHaveBeenCalled();
	expect((await getSubscriptionState(organizationId))?.plan).toBe("starter");
});

// downgrades and the organization cap

const pendingStarter = {
	id: "pending_1",
	created_at: "2026-09-30T10:00:00Z",
	modified_at: null,
	applies_at: "2026-10-22T10:00:00Z",
	product_id: productIdFor("starter"),
	seats: null,
	units: null,
	discount_id: null,
	discount_unset: false,
};

/** The caller owns Acme and Beta on Professional, Acme activated first. */
const seedTwoActive = async () => {
	const seeded = await seedOrg();
	const first = seeded.organizationId;
	await activateOrganization(first, "professional");
	await holdSlot(first, new Date("2026-09-01T00:00:00Z"));
	const second = await insertOrganization("Beta");
	await joinOrganization(second, seeded.userId, "owner");
	await holdSlot(second, new Date("2026-09-02T00:00:00Z"));
	return { ...seeded, first, second };
};

const slotsHeld = (...organizationIds: string[]) =>
	Promise.all(
		organizationIds.map(
			async (id) => (await getOrganizationState(id))?.slotHeld,
		),
	);

const deactivationEmails = async (userId: string) =>
	(await readOutboxEmails())
		.map(({ email }) => email)
		.filter(
			(email) =>
				email.to === `${userId}@test.dev` &&
				email.subject.includes("no longer active"),
		);

/** Polar applies the pending update when the period ends. */
const periodEnds = (organizationId: string, plan: PlanSlug) =>
	applySubscriptionEvent({
		data: subscription(organizationId, {
			product_id: productIdFor(plan),
			modified_at: "2026-10-22T10:00:01Z",
			current_period_end: "2026-11-22T10:00:00Z",
		}),
	});

/** Schedules Professional → Starter keeping `keep`, as Polar answers it. */
const scheduleStarter = async (
	cookie: string,
	organizationId: string,
	keep: string[],
) => {
	const get = stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId),
	);
	const update = stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(organizationId, {
			pending_update: pendingStarter,
			modified_at: "2026-09-30T10:00:00Z",
		}),
	);
	const res = await changePlan(cookie, { plan: "starter", keep });
	return { res, get, update };
};

test("POST plan: a downgrade below the active count needs picks among the active orgs, within the new cap; Polar not changed", async () => {
	const { cookie, first, second } = await seedTwoActive();
	stub(polarClient.subscriptions, "get").mockResolvedValue(subscription(first));
	const update = stub(polarClient.subscriptions, "update");

	const missing = await changePlan(cookie, { plan: "starter" });
	expect(missing.status).toBe(409);
	expect(await codeOf(missing)).toBe(API_ERROR_CODES.DOWNGRADE_PICKS_REQUIRED);
	for (const keep of [[first, second], ["org_unknown"], [second, second]])
		expect((await changePlan(cookie, { plan: "starter", keep })).status).toBe(
			400,
		);
	expect(update).not.toHaveBeenCalled();
	expect(await slotsHeld(first, second)).toEqual([true, true]);
});

test("POST plan: a downgrade with picks waits for the period end; both orgs stay active until then, then only the kept one, no email", async () => {
	const { cookie, userId, first, second } = await seedTwoActive();

	const { res, update } = await scheduleStarter(cookie, first, [second]);

	expect(res.status).toBe(200);
	expect(update).toHaveBeenCalledWith(`sub_${first}`, {
		product_id: productIdFor("starter"),
		proration_behavior: "next_period",
	});
	const dto = await unwrap<AccountSubscriptionDto>(res);
	expect(dto.plan).toBe("professional");
	expect(dto.pendingChange).toEqual({
		plan: "starter",
		appliesAt: "2026-10-22T10:00:00Z",
		deactivates: [{ id: first, name: "Acme" }],
	});
	expect(await slotsHeld(first, second)).toEqual([true, true]);
	expect((await getOrganizationState(first))?.status).toBe("active");

	await periodEnds(first, "starter");

	expect(await slotsHeld(first, second)).toEqual([false, true]);
	expect(await getOrganizationState(second)).toMatchObject({
		status: "active",
		ownerPlan: "starter",
	});
	expect(await findUserSubscription(userId)).toMatchObject({
		downgradePlan: null,
		downgradeReleases: [],
	});
	expect(await deactivationEmails(userId)).toEqual([]);
});

test("POST plan/cancel: clears the pending downgrade in Polar; the period end changes nothing; a second cancel → 409", async () => {
	const { cookie, userId, first, second } = await seedTwoActive();
	const { get, update } = await scheduleStarter(cookie, first, [second]);
	get.mockResolvedValue(
		subscription(first, {
			pending_update: pendingStarter,
			modified_at: "2026-09-30T10:00:00Z",
		}),
	);
	update.mockResolvedValue(
		subscription(first, { modified_at: "2026-09-30T11:00:00Z" }),
	);
	const cancel = () =>
		request("/api/account/subscription/plan/cancel", cookie, {
			method: "POST",
		});

	const res = await cancel();

	expect(res.status).toBe(200);
	expect(update).toHaveBeenLastCalledWith(`sub_${first}`, {
		pending_update: null,
	});
	expect((await unwrap<AccountSubscriptionDto>(res)).pendingChange).toBeNull();
	expect((await findUserSubscription(userId))?.downgradePlan).toBeNull();

	await periodEnds(first, "professional");
	expect(await slotsHeld(first, second)).toEqual([true, true]);

	get.mockResolvedValue(
		subscription(first, { modified_at: "2026-10-22T10:00:01Z" }),
	);
	const again = await cancel();
	expect(again.status).toBe(409);
	expect(await codeOf(again)).toBe(API_ERROR_CODES.PLAN_CHANGE_NOT_PENDING);
});

test("POST plan: an upgrade discards a pending downgrade, so its picks never apply", async () => {
	const { cookie, userId, first, second } = await seedTwoActive();
	const { update } = await scheduleStarter(cookie, first, [second]);
	update.mockResolvedValue(
		subscription(first, {
			product_id: productIdFor("enterprise"),
			modified_at: "2026-09-30T11:00:00Z",
		}),
	);

	const res = await changePlan(cookie, { plan: "enterprise" });

	expect(res.status).toBe(200);
	expect(update).toHaveBeenLastCalledWith(`sub_${first}`, {
		product_id: productIdFor("enterprise"),
		proration_behavior: "prorate",
	});
	expect((await unwrap<AccountSubscriptionDto>(res)).pendingChange).toBeNull();
	expect((await findUserSubscription(userId))?.downgradePlan).toBeNull();
	await periodEnds(first, "enterprise");
	expect(await slotsHeld(first, second)).toEqual([true, true]);
});

test("POST plan: upgrade, then activate up to the new cap and no further", async () => {
	const { organizationId, userId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "starter");
	const [second, third] = [
		await insertOrganization("Beta"),
		await insertOrganization("Gamma"),
	];
	await joinOrganization(second, userId, "owner");
	await joinOrganization(third, userId, "owner");
	const activate = (id: string) =>
		request(`/api/account/organizations/${id}/activate`, cookie, {
			method: "POST",
		});
	expect((await activate(second)).status).toBe(409);

	polarHasStarter(organizationId);
	stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(organizationId, { modified_at: "2026-09-30T10:00:00Z" }),
	);
	expect((await changePlan(cookie, { plan: "professional" })).status).toBe(200);

	expect((await activate(second)).status).toBe(200);
	const full = await activate(third);
	expect(full.status).toBe(409);
	expect(await codeOf(full)).toBe(API_ERROR_CODES.ORGANIZATION_LIMIT_REACHED);
	expect(await slotsHeld(organizationId, second, third)).toEqual([
		true,
		true,
		false,
	]);
});

test("POST plan: cancel pending → 409 with its own code, Polar not changed", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { cancel_at_period_end: true }),
	);
	const update = stub(polarClient.subscriptions, "update");

	const res = await changePlan(cookie, { plan: "starter" });

	expect(res.status).toBe(409);
	expect(await codeOf(res)).toBe(API_ERROR_CODES.CANCELLATION_PENDING);
	expect(update).not.toHaveBeenCalled();
});

test("projection: a downgrade applied outside the app keeps the earliest-activated orgs and emails the owner the rest (Default 9)", async () => {
	const { userId, first, second } = await seedTwoActive();

	await periodEnds(first, "starter");

	expect(await slotsHeld(first, second)).toEqual([true, false]);
	const [email, ...others] = await deactivationEmails(userId);
	expect(others).toEqual([]);
	expect(email?.subject).toBe("Beta is no longer active");
	expect(email?.html).toContain("keeps 1 organization active");
});

test("projection: a new plan with a lower cap after a lapse follows Default 9; the lapse itself keeps both slots", async () => {
	const { userId, first, second } = await seedTwoActive();

	await applySubscriptionEvent({
		data: subscription(first, {
			status: "canceled",
			modified_at: "2026-10-01T10:00:00Z",
		}),
	});
	expect(await slotsHeld(first, second)).toEqual([true, true]);
	expect((await getOrganizationState(first))?.status).toBe("inactive");

	await applySubscriptionEvent({
		data: subscription(first, {
			id: "sub_new",
			product_id: productIdFor("starter"),
			created_at: "2026-10-05T10:00:00Z",
			modified_at: "2026-10-05T10:00:00Z",
		}),
	});

	expect(await slotsHeld(first, second)).toEqual([true, false]);
	expect(await getOrganizationState(first)).toMatchObject({
		status: "active",
		ownerPlan: "starter",
	});
	expect((await deactivationEmails(userId)).map((e) => e.subject)).toEqual([
		"Beta is no longer active",
	]);
});

// POST /subscription/suspend, /unsuspend, /resume

const act = (
	cookie: string,
	action: "suspend" | "unsuspend" | "resume" | "cancel" | "uncancel",
) => request(`/api/account/subscription/${action}`, cookie, { method: "POST" });

const codeOf = async (res: Response) =>
	((await res.json()) as ApiResponse).code;

/** The state the projection leaves once the paused subscription arrives. */
const suspendInDb = async (organizationId: string) => {
	await givePlan(owner(organizationId), null, {
		status: "paused",
		subscriptionId: `sub_${organizationId}`,
	});
	await holdSlot(organizationId);
};

const suspended = (organizationId: string): SubscriptionState => ({
	status: "inactive",
	plan: null,
	subscriptionId: `sub_${organizationId}`,
});

test("suspend: pauses at period end; the org stays active on its plan until then", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId),
	);
	const update = stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(organizationId, {
			pause_at_period_end: true,
			modified_at: "2026-09-30T10:00:00Z",
		}),
	);

	const res = await act(cookie, "suspend");

	expect(res.status).toBe(200);
	expect(update).toHaveBeenCalledWith(`sub_${organizationId}`, {
		pause_at_period_end: true,
	});
	const dto = await unwrap<AccountSubscriptionDto>(res);
	expect(dto).toMatchObject({
		suspended: false,
		plan: "professional",
		billing: {
			pauseAtPeriodEnd: true,
			currentPeriodEnd: "2026-10-22T10:00:00Z",
		},
	});
	expect(await getSubscriptionState(organizationId)).toEqual({
		status: "active",
		plan: "professional",
		subscriptionId: `sub_${organizationId}`,
	});
});

test.each([
	["trialing", { status: "trialing" }, API_ERROR_CODES.SUBSCRIPTION_TRIALING],
	["past due", { status: "past_due" }, API_ERROR_CODES.SUBSCRIPTION_PAST_DUE],
	[
		"already set to suspend",
		{ pause_at_period_end: true },
		API_ERROR_CODES.SUSPENSION_PENDING,
	],
	[
		"set to cancel",
		{ cancel_at_period_end: true },
		API_ERROR_CODES.CANCELLATION_PENDING,
	],
	[
		"with a plan change scheduled",
		{ pending_update: pendingStarter },
		API_ERROR_CODES.PLAN_CHANGE_PENDING,
	],
	["ended", { status: "canceled" }, API_ERROR_CODES.PLAN_REQUIRED],
] as const)("suspend: subscription %s → 409 with its own code, Polar not updated", async (_, overrides, code) => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, overrides),
	);
	const update = stub(polarClient.subscriptions, "update");

	const res = await act(cookie, "suspend");

	expect(res.status).toBe(409);
	expect(await codeOf(res)).toBe(code);
	expect(update).not.toHaveBeenCalled();
});

test("suspend: already paused, webhook missed → 409 suspended, and the org is projected suspended", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { status: "paused" }),
	);
	const update = stub(polarClient.subscriptions, "update");

	const res = await act(cookie, "suspend");

	expect(await codeOf(res)).toBe(API_ERROR_CODES.PLAN_SUSPENDED);
	expect(update).not.toHaveBeenCalled();
	expect(await getSubscriptionState(organizationId)).toEqual(
		suspended(organizationId),
	);
});

test("suspend, unsuspend, resume, cancel, uncancel: org with no subscription → 409 inactive, Polar not asked", async () => {
	const { cookie } = await seedOrg();
	const get = stub(polarClient.subscriptions, "get");

	for (const action of [
		"suspend",
		"unsuspend",
		"resume",
		"cancel",
		"uncancel",
	] as const) {
		const res = await act(cookie, action);
		expect(res.status).toBe(409);
		expect(await codeOf(res)).toBe(API_ERROR_CODES.PLAN_REQUIRED);
	}
	expect(get).not.toHaveBeenCalled();
});

test("suspend: Polar refuses because another tab suspended first → explained from Polar's new state", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get")
		.mockResolvedValueOnce(subscription(organizationId))
		.mockResolvedValueOnce(
			subscription(organizationId, { pause_at_period_end: true }),
		);
	stub(polarClient.subscriptions, "update").mockRejectedValue(
		new PolarApiErrors.SubscriptionsUpdate409Error(409, {
			error: "CannotPauseSubscription",
			detail: "This subscription cannot be paused.",
		} as never),
	);

	const res = await act(cookie, "suspend");

	expect(res.status).toBe(409);
	expect(await codeOf(res)).toBe(API_ERROR_CODES.SUSPENSION_PENDING);
});

test("suspend: subscription locked, or Polar down → 409 or 502, org unchanged", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId),
	);
	const update = stub(polarClient.subscriptions, "update");

	update.mockRejectedValue(
		new PolarApiErrors.SubscriptionsUpdate409Error(409, {
			error: "SubscriptionLocked",
			detail: "locked",
		}),
	);
	expect((await act(cookie, "suspend")).status).toBe(409);
	update.mockRejectedValue(polarServerError());
	expect((await act(cookie, "suspend")).status).toBe(502);

	expect((await getSubscriptionState(organizationId))?.status).toBe("active");
});

test("unsuspend: takes back a pending pause", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { pause_at_period_end: true }),
	);
	const update = stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(organizationId, { modified_at: "2026-09-30T10:00:00Z" }),
	);

	const res = await act(cookie, "unsuspend");

	expect(res.status).toBe(200);
	expect(update).toHaveBeenCalledWith(`sub_${organizationId}`, {
		pause_at_period_end: false,
	});
	expect(
		(await unwrap<AccountSubscriptionDto>(res)).billing?.pauseAtPeriodEnd,
	).toBe(false);
});

test.each([
	["no pause pending", {}, API_ERROR_CODES.SUSPENSION_NOT_PENDING],
	[
		"the pause already in effect",
		{ status: "paused" },
		API_ERROR_CODES.PLAN_SUSPENDED,
	],
] as const)("unsuspend: %s → 409 with its own code, Polar not updated", async (_, overrides, code) => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, overrides),
	);
	const update = stub(polarClient.subscriptions, "update");

	const res = await act(cookie, "unsuspend");

	expect(res.status).toBe(409);
	expect(await codeOf(res)).toBe(code);
	expect(update).not.toHaveBeenCalled();
});

test("resume: suspended org → Polar resumes and charges, org active again on the same subscription", async () => {
	const { organizationId, cookie } = await seedOrg();
	await suspendInDb(organizationId);
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { status: "paused" }),
	);
	const update = stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(organizationId, { modified_at: "2026-10-25T10:00:00Z" }),
	);

	const res = await act(cookie, "resume");

	expect(res.status).toBe(200);
	expect(update).toHaveBeenCalledWith(`sub_${organizationId}`, {
		resume: true,
	});
	expect(((await res.clone().json()) as ApiResponse).message).toBe("Resumed");
	expect(await unwrap<AccountSubscriptionDto>(res)).toMatchObject({
		suspended: false,
		plan: "professional",
	});
	expect(await getSubscriptionState(organizationId)).toEqual({
		status: "active",
		plan: "professional",
		subscriptionId: `sub_${organizationId}`,
	});
});

test("resume: not paused → 409 not suspended; ended → 409 inactive and the binding released", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	const get = stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId),
	);
	const update = stub(polarClient.subscriptions, "update");

	expect(await codeOf(await act(cookie, "resume"))).toBe(
		API_ERROR_CODES.PLAN_NOT_SUSPENDED,
	);

	await suspendInDb(organizationId);
	get.mockResolvedValue(
		subscription(organizationId, {
			status: "canceled",
			modified_at: "2026-10-01T10:00:00Z",
		}),
	);
	expect(await codeOf(await act(cookie, "resume"))).toBe(
		API_ERROR_CODES.PLAN_REQUIRED,
	);
	expect(update).not.toHaveBeenCalled();
	expect(await getSubscriptionState(organizationId)).toEqual({
		status: "inactive",
		plan: null,
		subscriptionId: null,
	});
});

const paymentFailed = () =>
	new PolarApiErrors.SubscriptionsUpdate402Error(402, {
		error: "PaymentFailed",
		detail: "The card was declined.",
	} as never);

test("resume: charge fails and Polar retries it (past_due) → 200 active, the response says to fix payment", async () => {
	const { organizationId, cookie } = await seedOrg();
	await suspendInDb(organizationId);
	stub(polarClient.subscriptions, "get")
		.mockResolvedValueOnce(subscription(organizationId, { status: "paused" }))
		.mockResolvedValueOnce(
			subscription(organizationId, {
				status: "past_due",
				modified_at: "2026-10-25T10:00:00Z",
			}),
		);
	stub(polarClient.subscriptions, "update").mockRejectedValue(paymentFailed());

	const res = await act(cookie, "resume");

	expect(res.status).toBe(200);
	const body = (await res.json()) as ApiResponse<AccountSubscriptionDto>;
	expect(body.message).toContain("payment failed");
	expect(body.data?.billing?.subscriptionStatus).toBe("past_due");
	expect((await getSubscriptionState(organizationId))?.status).toBe("active");
});

test("resume: charge fails and the subscription stays paused → 402 with its own code, still suspended", async () => {
	const { organizationId, cookie } = await seedOrg();
	await suspendInDb(organizationId);
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { status: "paused" }),
	);
	stub(polarClient.subscriptions, "update").mockRejectedValue(paymentFailed());

	const res = await act(cookie, "resume");

	expect(res.status).toBe(402);
	expect(await codeOf(res)).toBe(API_ERROR_CODES.RESUME_PAYMENT_FAILED);
	expect(await getSubscriptionState(organizationId)).toEqual(
		suspended(organizationId),
	);
});

// Default 8: the slots outlive the pause, so resuming brings back the same orgs
test("suspend: every owned org stays active until the period end, then all go offline; resume brings back the same ones", async () => {
	const { cookie, first, second } = await seedTwoActive();
	const get = stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(first),
	);
	const update = stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(first, {
			pause_at_period_end: true,
			modified_at: "2026-09-30T10:00:00Z",
		}),
	);

	const before = await unwrap<AccountSubscriptionDto>(
		await request("/api/account/subscription", cookie),
	);
	expect(before.activeOrganizations).toEqual([
		{ id: first, name: "Acme" },
		{ id: second, name: "Beta" },
	]);
	expect((await act(cookie, "suspend")).status).toBe(200);
	for (const id of [first, second])
		expect((await getOrganizationState(id))?.status).toBe("active");

	await applySubscriptionEvent({
		data: subscription(first, {
			status: "paused",
			modified_at: "2026-10-22T10:00:01Z",
		}),
	});
	for (const id of [first, second])
		expect(await getOrganizationState(id)).toMatchObject({
			status: "inactive",
			slotHeld: true,
		});

	get.mockResolvedValue(
		subscription(first, {
			status: "paused",
			modified_at: "2026-10-22T10:00:01Z",
		}),
	);
	update.mockResolvedValue(
		subscription(first, { modified_at: "2026-10-25T10:00:00Z" }),
	);
	expect((await act(cookie, "resume")).status).toBe(200);
	for (const id of [first, second])
		expect(await getOrganizationState(id)).toMatchObject({
			status: "active",
			ownerPlan: "professional",
		});
});

// POST /subscription/cancel, /uncancel

test("cancel: ends at period end; every owned org stays active until then, then all go offline, slots kept", async () => {
	const { cookie, first, second } = await seedTwoActive();
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(first, { status: "trialing" }),
	);
	const update = stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(first, {
			status: "trialing",
			cancel_at_period_end: true,
			ends_at: "2026-10-22T10:00:00Z",
			modified_at: "2026-09-30T10:00:00Z",
		}),
	);

	const res = await act(cookie, "cancel");

	expect(res.status).toBe(200);
	expect(update).toHaveBeenCalledWith(`sub_${first}`, {
		cancel_at_period_end: true,
	});
	expect(await unwrap<AccountSubscriptionDto>(res)).toMatchObject({
		plan: "professional",
		billing: { cancelAtPeriodEnd: true, endsAt: "2026-10-22T10:00:00Z" },
	});
	for (const id of [first, second])
		expect((await getOrganizationState(id))?.status).toBe("active");

	await applySubscriptionEvent({
		data: subscription(first, {
			status: "canceled",
			cancel_at_period_end: true,
			ends_at: "2026-10-22T10:00:00Z",
			modified_at: "2026-10-22T10:00:01Z",
		}),
	});
	for (const id of [first, second])
		expect(await getOrganizationState(id)).toMatchObject({
			status: "inactive",
			slotHeld: true,
		});
});

test.each([
	[
		"set to suspend",
		{ pause_at_period_end: true },
		API_ERROR_CODES.SUSPENSION_PENDING,
	],
	[
		"already set to cancel",
		{ cancel_at_period_end: true },
		API_ERROR_CODES.CANCELLATION_PENDING,
	],
	[
		"with a plan change scheduled",
		{ pending_update: pendingStarter },
		API_ERROR_CODES.PLAN_CHANGE_PENDING,
	],
	["paused", { status: "paused" }, API_ERROR_CODES.PLAN_SUSPENDED],
	["ended", { status: "canceled" }, API_ERROR_CODES.PLAN_REQUIRED],
] as const)("cancel: subscription %s → 409 with its own code, Polar not updated", async (_, overrides, code) => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, overrides),
	);
	const update = stub(polarClient.subscriptions, "update");

	const res = await act(cookie, "cancel");

	expect(res.status).toBe(409);
	expect(await codeOf(res)).toBe(code);
	expect(update).not.toHaveBeenCalled();
});

test("cancel: past due → allowed, Polar keeps retrying until the period end", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { status: "past_due" }),
	);
	const update = stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(organizationId, {
			status: "past_due",
			cancel_at_period_end: true,
			modified_at: "2026-09-30T10:00:00Z",
		}),
	);

	expect((await act(cookie, "cancel")).status).toBe(200);
	expect(update).toHaveBeenCalledTimes(1);
});

test("uncancel: takes back a pending cancellation; none pending → 409 with its own code", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	const get = stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { cancel_at_period_end: true }),
	);
	const update = stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(organizationId, { modified_at: "2026-09-30T10:00:00Z" }),
	);

	const res = await act(cookie, "uncancel");

	expect(res.status).toBe(200);
	expect(update).toHaveBeenCalledWith(`sub_${organizationId}`, {
		cancel_at_period_end: false,
	});
	expect(
		(await unwrap<AccountSubscriptionDto>(res)).billing?.cancelAtPeriodEnd,
	).toBe(false);

	get.mockResolvedValue(
		subscription(organizationId, { modified_at: "2026-09-30T10:00:00Z" }),
	);
	const again = await act(cookie, "uncancel");
	expect(again.status).toBe(409);
	expect(await codeOf(again)).toBe(API_ERROR_CODES.CANCELLATION_NOT_PENDING);
	expect(update).toHaveBeenCalledTimes(1);
});

test("GET subscription: suspended org → inactive and suspended, its paused billing shown", async () => {
	const { organizationId, cookie } = await seedOrg();
	await suspendInDb(organizationId);
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { status: "paused" }),
	);

	expect(
		await unwrap<AccountSubscriptionDto>(
			await request("/api/account/subscription", cookie),
		),
	).toMatchObject({
		suspended: true,
		plan: null,
		billing: { subscriptionStatus: "paused" },
	});
});

// GET /invoices

const order = (organizationId: string, overrides: Partial<Order> = {}) =>
	({
		id: "order_1",
		invoice_number: "SINWY-0001",
		created_at: "2026-09-01T12:00:00Z",
		status: "paid",
		total_amount: 4900,
		currency: "eur",
		billing_reason: "subscription_cycle",
		is_invoice_generated: true,
		metadata: {},
		customer: {
			email: "private@example.com",
			external_id: ownerOf.get(organizationId),
		},
		...overrides,
	}) as Order;

test("GET invoices: lists the account's orders as invoice DTOs only", async () => {
	const { organizationId, cookie } = await seedOrg();
	const list = stub(polarClient.orders, "list").mockResolvedValue({
		items: [order(organizationId)],
		pagination: { total_count: 21, max_page: 3 },
	} as never);

	const dto = await unwrap<InvoiceListDto>(
		await request(`/api/account/invoices?page=2&limit=10`, cookie),
	);

	expect(list).toHaveBeenCalledWith({
		external_customer_id: owner(organizationId),
		sorting: ["-created_at"],
		page: 2,
		limit: 10,
	});
	expect(dto).toEqual({
		items: [
			{
				id: "order_1",
				number: "SINWY-0001",
				createdAt: "2026-09-01T12:00:00Z",
				status: "paid",
				totalAmount: 4900,
				currency: "eur",
				billingReason: "subscription_cycle",
				invoiceGenerated: true,
			},
		],
		page: 2,
		limit: 10,
		total: 21,
	});
});

test("GET invoices: Polar statuses and reasons we don't know → null", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "list").mockResolvedValue({
		items: [
			order(organizationId, {
				status: "disputed" as never,
				billing_reason: "subscription_pause" as never,
			}),
		],
		pagination: { total_count: 1, max_page: 1 },
	} as never);

	const dto = await unwrap<InvoiceListDto>(
		await request(`/api/account/invoices`, cookie),
	);
	expect(dto.items[0]).toMatchObject({ status: null, billingReason: null });
});

test("GET invoices: Polar down → 502", async () => {
	const { cookie } = await seedOrg();
	stub(polarClient.orders, "list").mockRejectedValue(polarServerError());

	expect((await request(`/api/account/invoices`, cookie)).status).toBe(502);
});

test("GET invoices: no query → first page of 20", async () => {
	const { cookie } = await seedOrg();
	const list = stub(polarClient.orders, "list").mockResolvedValue({
		items: [],
		pagination: { total_count: 0, max_page: 0 },
	} as never);

	await request(`/api/account/invoices`, cookie);
	expect(list).toHaveBeenCalledWith(
		expect.objectContaining({ page: 1, limit: 20 }),
	);
});

test.each([
	"page=0",
	"limit=0",
	"page=two",
	"page=1.5",
])("GET invoices: %s → 400, Polar not asked", async (query) => {
	const { cookie } = await seedOrg();
	const list = stub(polarClient.orders, "list");

	expect((await request(`/api/account/invoices?${query}`, cookie)).status).toBe(
		400,
	);
	expect(list).not.toHaveBeenCalled();
});

test("GET invoices: limit over the cap → 400", async () => {
	const { cookie } = await seedOrg();
	expect(
		(await request(`/api/account/invoices?limit=500`, cookie)).status,
	).toBe(400);
});

test("GET invoices: page past the cap → 400, Polar not asked", async () => {
	const { cookie } = await seedOrg();
	const list = stub(polarClient.orders, "list");

	expect(
		(await request(`/api/account/invoices?page=1e15`, cookie)).status,
	).toBe(400);
	expect(list).not.toHaveBeenCalled();
});

// GET /invoices/:orderId/download

const download = (cookie: string, orderId = "order_1") =>
	request(`/api/account/invoices/${orderId}/download`, cookie);

test("download: another customer's order → 404, never its invoice", async () => {
	const { cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockResolvedValue(order("org_someone_else"));
	const invoice = stub(polarClient.orders, "invoice");
	const generate = stub(polarClient.orders, "generateInvoice");

	expect((await download(cookie)).status).toBe(404);
	expect(invoice).not.toHaveBeenCalled();
	expect(generate).not.toHaveBeenCalled();
});

test("download: order whose customer has no external id → 404, never its invoice", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockResolvedValue(
		order(organizationId, { customer: { external_id: null } as never }),
	);
	const invoice = stub(polarClient.orders, "invoice");

	expect((await download(cookie)).status).toBe(404);
	expect(invoice).not.toHaveBeenCalled();
});

test("download: unknown order → 404", async () => {
	const { cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockRejectedValue(
		new PolarApiErrors.ResourceNotFound(404, {
			error: "ResourceNotFound",
			detail: "Not found",
		}),
	);
	expect((await download(cookie)).status).toBe(404);
});

test("download: generated invoice → presigned url", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockResolvedValue(order(organizationId));
	stub(polarClient.orders, "invoice").mockResolvedValue({
		url: "https://files.polar.test/invoice.pdf",
	});

	expect(await unwrap<{ url: string }>(await download(cookie))).toEqual({
		url: "https://files.polar.test/invoice.pdf",
	});
});

test("download: not generated yet → generation triggered, 202", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockResolvedValue(
		order(organizationId, { is_invoice_generated: false }),
	);
	const generate = stub(
		polarClient.orders,
		"generateInvoice",
	).mockResolvedValue(undefined as never);

	expect((await download(cookie)).status).toBe(202);
	expect(generate).toHaveBeenCalledWith("order_1");
});

test("download: missing billing details → 409 with Polar's reason", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockResolvedValue(
		order(organizationId, { is_invoice_generated: false }),
	);
	stub(polarClient.orders, "generateInvoice").mockRejectedValue(
		new PolarApiErrors.MissingInvoiceBillingDetails(422, {
			error: "MissingInvoiceBillingDetails",
			detail: "Billing name and address are required",
		}),
	);

	const res = await download(cookie);
	expect(res.status).toBe(409);
	expect(((await res.json()) as ApiResponse).message).toBe(
		"Billing name and address are required",
	);
});

test("download: unpaid order → 409 with its own code, not the billing details one", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockResolvedValue(
		order(organizationId, { status: "pending", is_invoice_generated: false }),
	);
	stub(polarClient.orders, "generateInvoice").mockRejectedValue(
		new PolarApiErrors.OrderNotEligibleForInvoice(409, {
			error: "OrderNotEligibleForInvoice",
			detail: "Order is not paid",
		}),
	);

	const res = await download(cookie);
	expect(res.status).toBe(409);
	expect(((await res.json()) as ApiResponse).code).toBe(
		API_ERROR_CODES.ORDER_NOT_PAID,
	);
});

test("download: Polar down → 502", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockResolvedValue(order(organizationId));
	stub(polarClient.orders, "invoice").mockRejectedValue(polarServerError());

	expect((await download(cookie)).status).toBe(502);
});

// Polar plugin hardening: the plugin calls Polar through its own core client

let polarCoreSpy: ReturnType<typeof stubPolarCore> | undefined;

afterEach(() => {
	polarCoreSpy?.mockRestore();
	polarCoreSpy = undefined;
});

test("plugin subscription list by reference_id → 403, it has no membership check", async () => {
	const { organizationId } = await seedOrg();
	const outsider = await createUserWithSession();
	polarCoreSpy = stubPolarCore();

	const res = await request(
		`/api/auth/customer/subscriptions/list?reference_id=${organizationId}`,
		outsider.cookie,
	);

	expect(res.status).toBe(403);
	expect(polarCoreSpy).not.toHaveBeenCalled();
});

test("plugin subscription list without reference_id still lists the caller's own", async () => {
	const { cookie } = await seedOrg();
	polarCoreSpy = stubPolarCore({
		"POST /v1/customer-sessions/": { token: "cst_1" },
		"GET /v1/customer-portal/subscriptions/": { items: [] },
	});

	const res = await request("/api/auth/customer/subscriptions/list", cookie);

	expect(res.status).toBe(200);
	expect(
		polarCoreRequests(polarCoreSpy, "POST /v1/customer-sessions/"),
	).toHaveLength(1);
	expect(
		polarCoreRequests(polarCoreSpy, "GET /v1/customer-portal/subscriptions/"),
	).toHaveLength(1);
});

const checkout = (cookie: string, body: Record<string, unknown>) =>
	request("/api/auth/checkout", cookie, { method: "POST", body });

const checkoutsCreated = () =>
	polarCoreSpy ? polarCoreRequests(polarCoreSpy, "POST /v1/checkouts/") : [];

/** Every core request sent, as `METHOD path`, oldest first. */
const coreRoutes = () =>
	(polarCoreSpy?.mock.calls ?? []).map(
		([[url, init]]) => `${init.method} ${new URL(url).pathname}`,
	);

const polarDown = (userId: string) => ({
	[`GET /v1/customers/external/${userId}`]: Response.json(
		{ error: "InternalServerError" },
		{ status: 502 },
	),
});

const billingUnavailable = {
	code: AUTH_ERROR_CODES.BILLING_UNAVAILABLE,
	message: "Billing is unavailable right now. Try again in a moment.",
};

test("plugin checkout: a plan slug → a Polar checkout for the caller's own customer, no org reference, the product's trial", async () => {
	const { userId, cookie } = await seedOrg();
	polarCoreSpy = stubPolarCore({
		"POST /v1/checkouts/": { url: "https://polar.test/checkout" },
	});

	const res = await checkout(cookie, { slug: "starter" });

	expect(res.status).toBe(200);
	const created = checkoutsCreated();
	expect(created).toHaveLength(1);
	expect(created[0]).toMatchObject({
		products: [productIdFor("starter")],
		external_customer_id: userId,
	});
	expect(created[0]).not.toHaveProperty("metadata.referenceId");
	expect(created[0]).not.toHaveProperty("allow_trial");
	expect(created[0]).not.toHaveProperty("discount_id");
});

test("plugin checkout after a first plan ended → the trial is turned off", async () => {
	const { userId, cookie } = await seedOrg();
	await givePlan(userId, null, { subscriptionId: null, status: "canceled" });
	polarCoreSpy = stubPolarCore({
		"POST /v1/checkouts/": { url: "https://polar.test/checkout" },
	});

	expect((await checkout(cookie, { slug: "professional" })).status).toBe(200);
	expect(checkoutsCreated()[0]).toMatchObject({ allow_trial: false });
});

test("plugin checkout while the user has a plan → 400 PLAN_EXISTS, no checkout", async () => {
	const { userId, cookie } = await seedOrg();
	await givePlan(userId, "starter");
	polarCoreSpy = stubPolarCore();

	const res = await checkout(cookie, { slug: "professional" });

	expect(res.status).toBe(400);
	expect(await res.json()).toMatchObject({
		code: AUTH_ERROR_CODES.PLAN_EXISTS,
		message: "You already have a plan; change or resume it instead",
	});
	expect(polarCoreSpy).not.toHaveBeenCalled();
});

test("plugin checkout while Polar fails → 500 with only the generic message", async () => {
	const { cookie } = await seedOrg();
	polarCoreSpy = stubPolarCore({
		"POST /v1/checkouts/": Response.json(
			{ error: "InternalServerError", detail: "db shard 7 down" },
			{ status: 500 },
		),
	});

	const consoleError = spyOn(console, "error").mockImplementation(() => {});

	const res = await checkout(cookie, { slug: "professional" });
	const logged = consoleError.mock.calls
		.map((args) => Bun.inspect(args))
		.join("\n");
	consoleError.mockRestore();

	expect(res.status).toBe(500);
	expect(await res.json()).toEqual({
		code: "INTERNAL_SERVER_ERROR",
		message: "Something went wrong. Try again in a moment.",
	});
	expect(checkoutsCreated()).toHaveLength(1);
	expect(logged).toContain("Polar API returned a server error: 500");
	expect(logged).not.toContain("db shard 7 down");
});

test("plugin checkout for a user with no Polar customer → the customer created under the account's email, then the checkout", async () => {
	const { userId, cookie } = await seedOrg();
	polarCoreSpy = stubPolarCore({
		"POST /v1/checkouts/": { url: "https://polar.test/checkout" },
	});

	expect((await checkout(cookie, { slug: "starter" })).status).toBe(200);
	expect(polarCoreRequests(polarCoreSpy, "POST /v1/customers/")).toEqual([
		{ email: `${userId}@test.dev`, name: "Test User", external_id: userId },
	]);
	const routes = coreRoutes();
	expect(routes.indexOf("POST /v1/customers/")).toBeLessThan(
		routes.indexOf("POST /v1/checkouts/"),
	);
});

test("plugin checkout while Polar can't ensure the customer → 503 BILLING_UNAVAILABLE, no checkout", async () => {
	const { userId, cookie } = await seedOrg();
	polarCoreSpy = stubPolarCore(polarDown(userId));

	const res = await checkout(cookie, { slug: "starter" });

	expect(res.status).toBe(503);
	expect(await res.json()).toMatchObject(billingUnavailable);
	expect(checkoutsCreated()).toHaveLength(0);
});

test("plugin checkout when another customer holds the account's email → 409 BILLING_ACCOUNT_REJECTED, no checkout", async () => {
	const { userId, cookie } = await seedOrg();
	polarCoreSpy = stubPolarCore({
		"GET /v1/customers/": {
			items: [
				{
					id: "cus_other",
					type: "individual",
					email: `${userId}@test.dev`,
					external_id: "user_other",
				},
			],
			pagination: { total_count: 1, max_page: 1 },
		},
	});

	const res = await checkout(cookie, { slug: "starter" });

	expect(res.status).toBe(409);
	expect(await res.json()).toMatchObject({
		code: AUTH_ERROR_CODES.BILLING_ACCOUNT_REJECTED,
	});
	expect(checkoutsCreated()).toHaveLength(0);
});

const openPortal = (cookie: string) =>
	request("/api/auth/customer/portal", cookie, {
		method: "POST",
		body: { redirect: false },
	});

test("plugin portal for a user with no Polar customer → the customer created, then the portal session", async () => {
	const { userId, cookie } = await seedOrg();
	polarCoreSpy = stubPolarCore({
		"POST /v1/customer-sessions/": {
			customer_portal_url: "https://polar.test/portal",
		},
	});

	const res = await openPortal(cookie);

	expect(res.status).toBe(200);
	expect(await res.json()).toMatchObject({ url: "https://polar.test/portal" });
	expect(coreRoutes().slice(-2)).toEqual([
		"POST /v1/customers/",
		"POST /v1/customer-sessions/",
	]);
	expect(
		polarCoreRequests(polarCoreSpy, "POST /v1/customer-sessions/"),
	).toMatchObject([{ external_customer_id: userId }]);
});

test("plugin portal while Polar can't ensure the customer → 503 BILLING_UNAVAILABLE, no portal session", async () => {
	const { userId, cookie } = await seedOrg();
	polarCoreSpy = stubPolarCore(polarDown(userId));

	const res = await openPortal(cookie);

	expect(res.status).toBe(503);
	expect(await res.json()).toMatchObject(billingUnavailable);
	expect(coreRoutes()).not.toContain("POST /v1/customer-sessions/");
});

const seedTransferTo = async (
	toUserId: string,
	status: "pending" | "accepted",
) => {
	const organizationId = await insertOrganization("Handed Over Co");
	const fromUserId = await activateOrganization(organizationId, "starter");
	await joinOrganization(organizationId, toUserId, "staff");
	const id = crypto.randomUUID();
	await db.insert(organizationTransfer).values({
		id,
		organizationId,
		fromUserId,
		toUserId,
		status,
		expiresAt: new Date(Date.now() + 60_000),
	});
	return { id, organizationId };
};

test("plugin checkout for a transfer waiting on it → the transfer in the metadata, back to the success page for that org", async () => {
	const { userId, cookie } = await createUserWithSession();
	const transfer = await seedTransferTo(userId, "accepted");
	polarCoreSpy = stubPolarCore({
		"POST /v1/checkouts/": { url: "https://polar.test/checkout" },
	});

	const res = await checkout(cookie, {
		slug: "starter",
		transferId: transfer.id,
	});

	expect(res.status).toBe(200);
	const [created] = checkoutsCreated() as Record<string, unknown>[];
	expect(created).toMatchObject({
		products: [productIdFor("starter")],
		external_customer_id: userId,
		metadata: { transferId: transfer.id },
	});
	expect(created).not.toHaveProperty("transferId");
	expect(created).not.toHaveProperty("allow_trial");
	const successUrl = new URL(String(created?.["success_url"]));
	expect(successUrl.searchParams.get("organization")).toBe(
		transfer.organizationId,
	);
	expect(successUrl.searchParams.get("checkout_id")).toBe("{CHECKOUT_ID}");
});

test("plugin checkout for a transfer not waiting on the caller's checkout → 400, Polar not called", async () => {
	const { userId, cookie } = await createUserWithSession();
	const pending = await seedTransferTo(userId, "pending");
	const someoneElses = await seedTransferTo(
		(await createUserWithSession()).userId,
		"accepted",
	);
	polarCoreSpy = stubPolarCore();

	for (const transferId of [pending.id, someoneElses.id, "unknown"]) {
		const res = await checkout(cookie, { slug: "starter", transferId });
		expect(res.status).toBe(400);
		expect(((await res.json()) as { message: string }).message).toBe(
			"This offer is no longer open",
		);
	}
	expect(polarCoreSpy).not.toHaveBeenCalled();
});

test.each([
	["an org reference", { reference_id: "org_victim" }],
	["metadata", { metadata: { referenceId: "org_victim" } }],
	["raw product ids", { products: ["prod_other"] }],
	[
		"a custom trial",
		{ allow_trial: true, trial_interval: "year", trial_interval_count: 1000 },
	],
	["a discount", { discount_id: "disc_1" }],
	["a discount code", { discount_code: "FREE100" }],
	["custom field data", { custom_field_data: { seats: 99 } }],
	["a foreign success url", { success_url: "https://evil.test" }],
	["a foreign return url", { return_url: "https://evil.test" }],
	["an embed origin", { embed_origin: "https://evil.test" }],
	["a team customer", { organization_id: "org_victim" }],
])("plugin checkout with %s → 400, Polar not called", async (_, extra) => {
	const { cookie } = await seedOrg();
	polarCoreSpy = stubPolarCore();

	const res = await checkout(cookie, { slug: "starter", ...extra });

	expect(res.status).toBe(400);
	expect(((await res.json()) as { message: string }).message).toBe(
		"Invalid checkout request",
	);
	expect(checkoutsCreated()).toHaveLength(0);
});

test.each([
	["no slug", {}],
	["an unknown slug", { slug: "free" }],
])("plugin checkout with %s → 400, Polar not called", async (_, body) => {
	const { cookie } = await seedOrg();
	polarCoreSpy = stubPolarCore();

	expect((await checkout(cookie, body)).status).toBe(400);
	expect(checkoutsCreated()).toHaveLength(0);
});

// account deletion

test("revoking an account's plans: every billable subscription across pages, past_due and paused included, listed by customer", async () => {
	const { userId } = await seedOrg();
	listSubscriptions.mockImplementation(
		polarPages(
			[
				{ id: "sub_1", status: "active" },
				{ id: "sub_old", status: "canceled" },
			],
			[
				{ id: "sub_2", status: "past_due" },
				{ id: "sub_paused", status: "paused" },
			],
		),
	);
	const revoke = stub(polarClient.subscriptions, "revoke").mockResolvedValue(
		{} as never,
	);

	await revokeAccountSubscriptions(userId);

	expect(listSubscriptions).toHaveBeenCalledWith({
		external_customer_id: userId,
		limit: 100,
	});
	expect(revoke.mock.calls).toEqual([["sub_1"], ["sub_2"], ["sub_paused"]]);
});
