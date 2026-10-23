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
	insertOrganization,
	joinOrganization,
	polarCoreRequests,
	polarPages,
	stubPolarCore,
} from "@backend/test/helpers";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { getSubscriptionState } from "@organizationsModule";
import {
	PolarClientError,
	PolarNetworkError,
	PolarServerError,
} from "@polar-sh/sdk";
import {
	API_ERROR_CODES,
	type ApiResponse,
	type InvoiceListDto,
	type OrganizationSubscriptionDto,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerBillingRoutes } from "../routes";

type Order = PolarModels.Order;
type Subscription = PolarModels.Subscription;

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerBillingRoutes(app);
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

const seedOrg = async (role = "owner") => {
	const organizationId = await insertOrganization("Acme");
	const { userId, cookie } = await createUserWithSession();
	await joinOrganization(organizationId, userId, role);
	return { organizationId, cookie };
};

const subscription = (
	organizationId: string,
	overrides: Partial<Subscription> = {},
) =>
	({
		id: `sub_${organizationId}`,
		status: "active",
		product_id: productIdFor("professional"),
		metadata: { referenceId: organizationId },
		amount: 4900,
		currency: "eur",
		recurring_interval: "month",
		recurring_interval_count: 1,
		created_at: "2026-09-22T10:00:00Z",
		modified_at: "2026-09-22T10:00:00Z",
		current_period_end: "2026-10-22T10:00:00Z",
		cancel_at_period_end: false,
		ends_at: null,
		...overrides,
	}) as Subscription;

const polarServerError = () =>
	new PolarServerError(500, "customer@example.com");

// GET /status

test("GET status: member → { status }; non-member → 404; no session → 401", async () => {
	const { organizationId, cookie } = await seedOrg("staff");
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

test("GET status: inactive org with an active Polar subscription → active, self-healed with its plan", async () => {
	const { organizationId, cookie } = await seedOrg();
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

test("GET status: already-active org and non-members never reach for Polar", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId);
	const outsider = await createUserWithSession();
	const inactive = await seedOrg();

	await request(`/api/organizations/${organizationId}/status`, cookie);
	await request(
		`/api/organizations/${inactive.organizationId}/status`,
		outsider.cookie,
	);
	expect(listSubscriptions).not.toHaveBeenCalled();
});

test("billing responses are never cached, refusals included", async () => {
	const { organizationId, cookie } = await seedOrg();
	const outsider = await createUserWithSession();

	for (const [path, as] of [
		["status", cookie],
		["subscription", cookie],
		["invoices", outsider.cookie],
	] as const) {
		const res = await request(
			`/api/organizations/${organizationId}/${path}`,
			as,
		);
		expect(res.headers.get("cache-control")).toBe("no-store");
	}
});

test("non-members → 404 and staff → 403 on every organization billing route", async () => {
	const { organizationId } = await seedOrg();
	await activateOrganization(organizationId);
	const outsider = await createUserWithSession();
	const staff = await createUserWithSession();
	await joinOrganization(organizationId, staff.userId, "staff");
	stub(polarClient.subscriptions, "get");

	const routes = [
		["GET", "subscription"],
		["POST", "subscription/plan"],
		["GET", "invoices"],
		["GET", "invoices/order_1/download"],
	] as const;
	for (const [method, path] of routes) {
		const url = `/api/organizations/${organizationId}/${path}`;
		const body = method === "POST" ? { plan: "enterprise" } : undefined;
		expect((await request(url, outsider.cookie, { method, body })).status).toBe(
			404,
		);
		if (path !== "subscription")
			expect((await request(url, staff.cookie, { method, body })).status).toBe(
				403,
			);
	}
});

// GET /subscription

test("GET subscription: inactive org → no plan, no features, no billing", async () => {
	const { organizationId, cookie } = await seedOrg("staff");
	const get = stub(polarClient.subscriptions, "get");

	expect(
		await unwrap<OrganizationSubscriptionDto>(
			await request(
				`/api/organizations/${organizationId}/subscription`,
				cookie,
			),
		),
	).toEqual({ status: "inactive", plan: null, features: [], billing: null });
	expect(get).not.toHaveBeenCalled();
});

test("GET subscription: active org → plan features and live billing details", async () => {
	const { organizationId, cookie } = await seedOrg("staff");
	await activateOrganization(organizationId, "professional");
	const get = stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { cancel_at_period_end: true }),
	);

	const dto = await unwrap<OrganizationSubscriptionDto>(
		await request(`/api/organizations/${organizationId}/subscription`, cookie),
	);

	expect(get).toHaveBeenCalledWith(`sub_${organizationId}`);
	expect(dto).toEqual({
		status: "active",
		plan: "professional",
		features: ["page-builder", "custom-domain", "analytics-advanced"],
		billing: {
			subscriptionStatus: "active",
			amount: 4900,
			currency: "eur",
			interval: "month",
			intervalCount: 1,
			currentPeriodEnd: "2026-10-22T10:00:00Z",
			cancelAtPeriodEnd: true,
			endsAt: null,
		},
	});
});

test("GET subscription: Polar down → projection still served, billing null", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "enterprise");
	const get = stub(polarClient.subscriptions, "get").mockRejectedValue(
		new Error("polar down"),
	);

	const res = await request(
		`/api/organizations/${organizationId}/subscription`,
		cookie,
	);
	expect(get).toHaveBeenCalledWith(`sub_${organizationId}`);
	expect(res.status).toBe(200);
	const dto = await unwrap<OrganizationSubscriptionDto>(res);
	expect(dto.plan).toBe("enterprise");
	expect(dto.billing).toBeNull();
});

test("GET subscription: multi-month interval keeps its count", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { recurring_interval_count: 3 }),
	);

	const dto = await unwrap<OrganizationSubscriptionDto>(
		await request(`/api/organizations/${organizationId}/subscription`, cookie),
	);
	expect(dto.billing).toMatchObject({ interval: "month", intervalCount: 3 });
});

test("GET subscription: a Polar status we don't know → billing null, not entitled like in a webhook", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { status: "frozen" as never }),
	);

	const dto = await unwrap<OrganizationSubscriptionDto>(
		await request(`/api/organizations/${organizationId}/subscription`, cookie),
	);
	expect(dto).toMatchObject({ status: "inactive", plan: null, billing: null });
});

test("GET subscription: a paused subscription → inactive, billing reports the pause", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "professional");
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, { status: "paused" }),
	);

	const dto = await unwrap<OrganizationSubscriptionDto>(
		await request(`/api/organizations/${organizationId}/subscription`, cookie),
	);
	expect(dto).toMatchObject({ status: "inactive", plan: null });
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

	const dto = await unwrap<OrganizationSubscriptionDto>(
		await request(`/api/organizations/${organizationId}/subscription`, cookie),
	);

	expect(dto).toMatchObject({ status: "inactive", plan: null, features: [] });
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
	await db
		.update(organization)
		.set({ subscriptionStatusAt: new Date("2026-10-01T00:00:00Z") })
		.where(eq(organization.id, organizationId));
	stub(polarClient.subscriptions, "get").mockResolvedValue(
		subscription(organizationId, {
			status: "canceled",
			modified_at: "2026-09-30T00:00:00Z",
		}),
	);

	const dto = await unwrap<OrganizationSubscriptionDto>(
		await request(`/api/organizations/${organizationId}/subscription`, cookie),
	);

	expect(dto).toMatchObject({ status: "active", plan: "professional" });
	expect((await getSubscriptionState(organizationId))?.status).toBe("active");
});

test("GET subscription: organization deleted mid-request → 404", async () => {
	const { organizationId, cookie } = await seedOrg();
	// the inactive org's reconcile runs after membership resolved
	listSubscriptions.mockImplementation(async function* () {
		await db.delete(organization).where(eq(organization.id, organizationId));
		yield* [];
	});

	expect(
		(await request(`/api/organizations/${organizationId}/subscription`, cookie))
			.status,
	).toBe(404);
});

// POST /subscription/plan

const changePlan = (organizationId: string, cookie: string, body: unknown) =>
	request(`/api/organizations/${organizationId}/subscription/plan`, cookie, {
		method: "POST",
		body,
	});

test("POST plan: only billing managers; staff and admin → 403", async () => {
	for (const role of ["staff", "admin"]) {
		const { organizationId, cookie } = await seedOrg(role);
		await activateOrganization(organizationId);
		expect(
			(await changePlan(organizationId, cookie, { plan: "enterprise" })).status,
		).toBe(403);
	}
});

test("POST plan: invalid body → 400, inactive org → 409, same plan → 400", async () => {
	const { organizationId, cookie } = await seedOrg();
	const update = stub(polarClient.subscriptions, "update");

	expect(
		(await changePlan(organizationId, cookie, { plan: "gold" })).status,
	).toBe(400);
	const inactive = await changePlan(organizationId, cookie, {
		plan: "enterprise",
	});
	expect(inactive.status).toBe(409);
	expect(((await inactive.json()) as ApiResponse).code).toBe(
		API_ERROR_CODES.ORGANIZATION_INACTIVE,
	);

	await activateOrganization(organizationId, "enterprise");
	expect(
		(await changePlan(organizationId, cookie, { plan: "enterprise" })).status,
	).toBe(400);
	expect(update).not.toHaveBeenCalled();
});

test("POST plan: switches the product with next-invoice proration and applies it at once", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "starter");
	// the webhook that activated the starter plan
	await db
		.update(organization)
		.set({ subscriptionStatusAt: new Date("2026-09-22T10:00:00Z") })
		.where(eq(organization.id, organizationId));
	const update = stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(organizationId, {
			product_id: productIdFor("enterprise"),
			amount: 9900,
			modified_at: "2026-09-30T10:00:00Z",
		}),
	);

	const res = await changePlan(organizationId, cookie, { plan: "enterprise" });

	expect(res.status).toBe(200);
	expect(update).toHaveBeenCalledWith(`sub_${organizationId}`, {
		product_id: productIdFor("enterprise"),
		proration_behavior: "prorate",
	});
	const dto = await unwrap<OrganizationSubscriptionDto>(res);
	expect(dto.plan).toBe("enterprise");
	expect(dto.features).toContain("multi-location");
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
	const polarNow = new Date(Date.now() + 3_600_000);
	await db
		.update(organization)
		.set({ subscriptionStatusAt: polarNow })
		.where(eq(organization.id, organizationId));
	stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(organizationId, {
			product_id: productIdFor("enterprise"),
			modified_at: new Date(polarNow.getTime() + 1000).toISOString(),
		}),
	);

	const dto = await unwrap<OrganizationSubscriptionDto>(
		await changePlan(organizationId, cookie, { plan: "enterprise" }),
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
		const res = await changePlan(organizationId, cookie, {
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

	const res = await changePlan(organizationId, cookie, { plan: "enterprise" });

	expect(res.status).toBe(200);
	expect(get).toHaveBeenCalledWith(`sub_${organizationId}`);
	expect((await unwrap<OrganizationSubscriptionDto>(res)).plan).toBe(
		"enterprise",
	);
	expect((await getSubscriptionState(organizationId))?.plan).toBe("enterprise");
});

test("POST plan: canceled subscription → 409, plan unchanged", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "starter");
	stub(polarClient.subscriptions, "update").mockRejectedValue(
		new PolarApiErrors.SubscriptionsUpdate403Error(403, {
			error: "AlreadyCanceledSubscription",
			detail: "canceled",
		}),
	);

	const canceled = await changePlan(organizationId, cookie, {
		plan: "enterprise",
	});
	expect(canceled.status).toBe(409);
	expect(((await canceled.json()) as ApiResponse).code).toBe(409);
	expect((await getSubscriptionState(organizationId))?.plan).toBe("starter");
});

test("POST plan: subscription locked by another update → 409, plan unchanged", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "starter");
	stub(polarClient.subscriptions, "update").mockRejectedValue(
		new PolarApiErrors.SubscriptionsUpdate409Error(409, {
			error: "SubscriptionLocked",
			detail: "locked",
		}),
	);

	expect(
		(await changePlan(organizationId, cookie, { plan: "enterprise" })).status,
	).toBe(409);
	expect((await getSubscriptionState(organizationId))?.plan).toBe("starter");
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
		metadata: { referenceId: organizationId },
		customer: { email: "private@example.com" },
		...overrides,
	}) as Order;

test("GET invoices: admin → 403", async () => {
	const { organizationId, cookie } = await seedOrg("admin");
	expect(
		(await request(`/api/organizations/${organizationId}/invoices`, cookie))
			.status,
	).toBe(403);
});

test("GET invoices: lists the organization's orders as invoice DTOs only", async () => {
	const { organizationId, cookie } = await seedOrg();
	const list = stub(polarClient.orders, "list").mockResolvedValue({
		items: [order(organizationId)],
		pagination: { total_count: 21, max_page: 3 },
	} as never);

	const dto = await unwrap<InvoiceListDto>(
		await request(
			`/api/organizations/${organizationId}/invoices?page=2&limit=10`,
			cookie,
		),
	);

	expect(list).toHaveBeenCalledWith({
		metadata: { referenceId: organizationId },
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
		await request(`/api/organizations/${organizationId}/invoices`, cookie),
	);
	expect(dto.items[0]).toMatchObject({ status: null, billingReason: null });
});

test("GET invoices: Polar down → 502", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "list").mockRejectedValue(polarServerError());

	expect(
		(await request(`/api/organizations/${organizationId}/invoices`, cookie))
			.status,
	).toBe(502);
});

test("GET invoices: no query → first page of 20", async () => {
	const { organizationId, cookie } = await seedOrg();
	const list = stub(polarClient.orders, "list").mockResolvedValue({
		items: [],
		pagination: { total_count: 0, max_page: 0 },
	} as never);

	await request(`/api/organizations/${organizationId}/invoices`, cookie);
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
	const { organizationId, cookie } = await seedOrg();
	const list = stub(polarClient.orders, "list");

	expect(
		(
			await request(
				`/api/organizations/${organizationId}/invoices?${query}`,
				cookie,
			)
		).status,
	).toBe(400);
	expect(list).not.toHaveBeenCalled();
});

test("GET invoices: limit over the cap → 400", async () => {
	const { organizationId, cookie } = await seedOrg();
	expect(
		(
			await request(
				`/api/organizations/${organizationId}/invoices?limit=500`,
				cookie,
			)
		).status,
	).toBe(400);
});

test("GET invoices: page past the cap → 400, Polar not asked", async () => {
	const { organizationId, cookie } = await seedOrg();
	const list = stub(polarClient.orders, "list");

	expect(
		(
			await request(
				`/api/organizations/${organizationId}/invoices?page=1e15`,
				cookie,
			)
		).status,
	).toBe(400);
	expect(list).not.toHaveBeenCalled();
});

// GET /invoices/:orderId/download

const download = (
	organizationId: string,
	cookie: string,
	orderId = "order_1",
) =>
	request(
		`/api/organizations/${organizationId}/invoices/${orderId}/download`,
		cookie,
	);

test("download: another organization's order → 404, never its invoice", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockResolvedValue(order("org_someone_else"));
	const invoice = stub(polarClient.orders, "invoice");
	const generate = stub(polarClient.orders, "generateInvoice");

	expect((await download(organizationId, cookie)).status).toBe(404);
	expect(invoice).not.toHaveBeenCalled();
	expect(generate).not.toHaveBeenCalled();
});

test("download: order without a referenceId → 404, never its invoice", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockResolvedValue(
		order(organizationId, { metadata: {} }),
	);
	const invoice = stub(polarClient.orders, "invoice");

	expect((await download(organizationId, cookie)).status).toBe(404);
	expect(invoice).not.toHaveBeenCalled();
});

test("download: unknown order → 404", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockRejectedValue(
		new PolarApiErrors.ResourceNotFound(404, {
			error: "ResourceNotFound",
			detail: "Not found",
		}),
	);
	expect((await download(organizationId, cookie)).status).toBe(404);
});

test("download: generated invoice → presigned url", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockResolvedValue(order(organizationId));
	stub(polarClient.orders, "invoice").mockResolvedValue({
		url: "https://files.polar.test/invoice.pdf",
	});

	expect(
		await unwrap<{ url: string }>(await download(organizationId, cookie)),
	).toEqual({
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

	expect((await download(organizationId, cookie)).status).toBe(202);
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

	const res = await download(organizationId, cookie);
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

	const res = await download(organizationId, cookie);
	expect(res.status).toBe(409);
	expect(((await res.json()) as ApiResponse).code).toBe(
		API_ERROR_CODES.ORDER_NOT_PAID,
	);
});

test("download: Polar down → 502", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockResolvedValue(order(organizationId));
	stub(polarClient.orders, "invoice").mockRejectedValue(polarServerError());

	expect((await download(organizationId, cookie)).status).toBe(502);
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

test("plugin checkout: plan slug and own org → Polar checkout bound to that org", async () => {
	const { organizationId, cookie } = await seedOrg();
	polarCoreSpy = stubPolarCore({
		"POST /v1/checkouts/": { url: "https://polar.test/checkout" },
	});

	const res = await checkout(cookie, {
		slug: "starter",
		reference_id: organizationId,
	});

	expect(res.status).toBe(200);
	const created = checkoutsCreated();
	expect(created).toHaveLength(1);
	expect(created[0]).toMatchObject({
		products: [productIdFor("starter")],
		metadata: { referenceId: organizationId },
	});
	expect(created[0]).not.toHaveProperty("allow_trial");
	expect(created[0]).not.toHaveProperty("discount_id");
});

test.each([
	["metadata overriding the org", { metadata: { referenceId: "org_victim" } }],
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
	const { organizationId, cookie } = await seedOrg();
	polarCoreSpy = stubPolarCore();

	const res = await checkout(cookie, {
		slug: "starter",
		reference_id: organizationId,
		...extra,
	});

	expect(res.status).toBe(400);
	expect(((await res.json()) as { message: string }).message).toBe(
		"Invalid checkout request",
	);
	expect(checkoutsCreated()).toHaveLength(0);
});

test.each([
	["no reference_id", () => ({ slug: "starter" })],
	["no slug", (referenceId: string) => ({ reference_id: referenceId })],
	[
		"an unknown slug",
		(referenceId: string) => ({ slug: "free", reference_id: referenceId }),
	],
	[
		"the 1.x camelCase referenceId",
		(referenceId: string) => ({ slug: "starter", referenceId }),
	],
])("plugin checkout with %s → 400, Polar not called", async (_, body) => {
	const { organizationId, cookie } = await seedOrg();
	polarCoreSpy = stubPolarCore();

	const res = await checkout(cookie, body(organizationId));

	expect(res.status).toBe(400);
	expect(checkoutsCreated()).toHaveLength(0);
});
