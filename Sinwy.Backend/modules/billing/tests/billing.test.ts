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
import { polarClient, productIdFor } from "@backend/infrastructure/polar";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { getSubscriptionState } from "@organizationsModule";
import type { Order } from "@polar-sh/sdk/models/components/order";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import { AlreadyCanceledSubscription } from "@polar-sh/sdk/models/errors/alreadycanceledsubscription";
import { MissingInvoiceBillingDetails } from "@polar-sh/sdk/models/errors/missinginvoicebillingdetails";
import { ResourceNotFound } from "@polar-sh/sdk/models/errors/resourcenotfound";
import {
	API_ERROR_CODES,
	type ApiResponse,
	type InvoiceListDto,
	type OrganizationSubscriptionDto,
} from "@sinwy/shared";
import type { Server } from "bun";
import { registerBillingRoutes } from "../routes";

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

// Every Polar reach is stubbed per test; unstubbed calls would hit the network.
const spies: ReturnType<typeof spyOn>[] = [];
const stub = <T extends object>(target: T, method: keyof T & string) => {
	const spy = spyOn(target, method as never) as ReturnType<typeof spyOn>;
	spies.push(spy);
	return spy;
};

let listSubscriptions: ReturnType<typeof spyOn>;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	listSubscriptions = stub(polarClient.subscriptions, "list").mockResolvedValue(
		{ result: { items: [], pagination: {} } } as never,
	);
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
		productId: productIdFor("professional"),
		metadata: { referenceId: organizationId },
		amount: 4900,
		currency: "eur",
		recurringInterval: "month",
		currentPeriodEnd: new Date("2026-10-22T10:00:00Z"),
		cancelAtPeriodEnd: false,
		endsAt: null,
		...overrides,
	}) as Subscription;

const httpMeta = (status: number) => ({
	response: new Response(null, { status }),
	request: new Request("https://polar.test"),
	body: "",
});

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
	listSubscriptions.mockResolvedValue({
		result: { items: [subscription(organizationId)], pagination: {} },
	} as never);

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
		subscription(organizationId, { cancelAtPeriodEnd: true }),
	);

	const dto = await unwrap<OrganizationSubscriptionDto>(
		await request(`/api/organizations/${organizationId}/subscription`, cookie),
	);

	expect(get).toHaveBeenCalledWith({ id: `sub_${organizationId}` });
	expect(dto).toEqual({
		status: "active",
		plan: "professional",
		features: ["page-builder", "custom-domain", "analytics-advanced"],
		billing: {
			subscriptionStatus: "active",
			amount: 4900,
			currency: "eur",
			interval: "month",
			currentPeriodEnd: "2026-10-22T10:00:00.000Z",
			cancelAtPeriodEnd: true,
			endsAt: null,
		},
	});
});

test("GET subscription: Polar down → projection still served, billing null", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "enterprise");
	stub(polarClient.subscriptions, "get").mockRejectedValue(
		new Error("polar down"),
	);

	const res = await request(
		`/api/organizations/${organizationId}/subscription`,
		cookie,
	);
	expect(res.status).toBe(200);
	const dto = await unwrap<OrganizationSubscriptionDto>(res);
	expect(dto.plan).toBe("enterprise");
	expect(dto.billing).toBeNull();
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
	const update = stub(polarClient.subscriptions, "update").mockResolvedValue(
		subscription(organizationId, { productId: productIdFor("enterprise") }),
	);

	const res = await changePlan(organizationId, cookie, { plan: "enterprise" });

	expect(res.status).toBe(200);
	expect(update).toHaveBeenCalledWith({
		id: `sub_${organizationId}`,
		subscriptionUpdate: {
			productId: productIdFor("enterprise"),
			prorationBehavior: "prorate",
		},
	});
	const dto = await unwrap<OrganizationSubscriptionDto>(res);
	expect(dto.plan).toBe("enterprise");
	expect(dto.features).toContain("multi-location");
	expect((await getSubscriptionState(organizationId))?.plan).toBe("enterprise");
});

test("POST plan: canceled subscription → 409, plan unchanged", async () => {
	const { organizationId, cookie } = await seedOrg();
	await activateOrganization(organizationId, "starter");
	stub(polarClient.subscriptions, "update").mockRejectedValue(
		new AlreadyCanceledSubscription(
			{ error: "AlreadyCanceledSubscription", detail: "canceled" },
			httpMeta(403),
		),
	);

	const canceled = await changePlan(organizationId, cookie, {
		plan: "enterprise",
	});
	expect(canceled.status).toBe(409);
	expect(((await canceled.json()) as ApiResponse).code).toBe(409);
	expect((await getSubscriptionState(organizationId))?.plan).toBe("starter");
});

// GET /invoices

const order = (organizationId: string, overrides: Partial<Order> = {}) =>
	({
		id: "order_1",
		invoiceNumber: "SINWY-0001",
		createdAt: new Date("2026-09-01T12:00:00Z"),
		status: "paid",
		totalAmount: 4900,
		currency: "eur",
		billingReason: "subscription_cycle",
		isInvoiceGenerated: true,
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
		result: {
			items: [order(organizationId)],
			pagination: { totalCount: 21, maxPage: 3 },
		},
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
				createdAt: "2026-09-01T12:00:00.000Z",
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

test("download: unknown order → 404", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockRejectedValue(
		new ResourceNotFound(
			{ error: "ResourceNotFound", detail: "Not found" },
			httpMeta(404),
		),
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
		order(organizationId, { isInvoiceGenerated: false }),
	);
	const generate = stub(
		polarClient.orders,
		"generateInvoice",
	).mockResolvedValue(undefined as never);

	expect((await download(organizationId, cookie)).status).toBe(202);
	expect(generate).toHaveBeenCalledWith({ id: "order_1" });
});

test("download: missing billing details → 409 with Polar's reason", async () => {
	const { organizationId, cookie } = await seedOrg();
	stub(polarClient.orders, "get").mockResolvedValue(
		order(organizationId, { isInvoiceGenerated: false }),
	);
	stub(polarClient.orders, "generateInvoice").mockRejectedValue(
		new MissingInvoiceBillingDetails(
			{
				error: "MissingInvoiceBillingDetails",
				detail: "Billing name and address are required",
			},
			httpMeta(422),
		),
	);

	const res = await download(organizationId, cookie);
	expect(res.status).toBe(409);
	expect(((await res.json()) as ApiResponse).message).toBe(
		"Billing name and address are required",
	);
});

// Polar plugin hardening

test("plugin subscription list by referenceId → 403, it has no membership check", async () => {
	const { organizationId } = await seedOrg();
	const outsider = await createUserWithSession();

	const res = await request(
		`/api/auth/customer/subscriptions/list?referenceId=${organizationId}`,
		outsider.cookie,
	);

	expect(res.status).toBe(403);
	expect(listSubscriptions).not.toHaveBeenCalled();
});
