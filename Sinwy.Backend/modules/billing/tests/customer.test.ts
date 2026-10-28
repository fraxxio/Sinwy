import { afterEach, expect, test } from "bun:test";
import { polarCoreRequests, stubPolarCore } from "@backend/test/helpers";
import { PolarNetworkError } from "@polar-sh/sdk";
import { AUTH_ERROR_CODES } from "@sinwy/shared";
import { deletePolarCustomer, ensurePolarCustomer } from "../customer";

let polarSpy: ReturnType<typeof stubPolarCore> | undefined;

afterEach(() => {
	polarSpy?.mockRestore();
	polarSpy = undefined;
});

const owner = {
	id: "user_ensure",
	email: "ann@sinwy.test",
	name: "Ann Lee",
};

const customer = (fields: Record<string, unknown> = {}) => ({
	id: "cus_1",
	type: "individual",
	email: owner.email,
	name: owner.name,
	external_id: owner.id,
	...fields,
});

const customersWithEmail = (...items: unknown[]) => ({
	items,
	pagination: { total_count: items.length, max_page: 1 },
});

const byExternalId = `GET /v1/customers/external/${owner.id}`;

const stub = (responses: Record<string, unknown>) => {
	polarSpy = stubPolarCore(responses);
	return polarSpy;
};

/** Every request sent, as `METHOD path?query`, oldest first. */
const sent = () =>
	(polarSpy?.mock.calls ?? []).map(([[url, init]]) => {
		const { pathname, search } = new URL(url);
		return `${init.method} ${pathname}${search}`;
	});

test("an up-to-date customer: nothing but the lookup", async () => {
	stub({ [byExternalId]: customer() });

	await ensurePolarCustomer(owner);

	expect(sent()).toEqual([byExternalId]);
});

test("a customer with a stale email or name: updated to the account's", async () => {
	const spy = stub({
		[byExternalId]: customer({ email: "old@sinwy.test", name: "Ann" }),
		"PATCH /v1/customers/cus_1": customer(),
	});

	await ensurePolarCustomer(owner);

	expect(polarCoreRequests(spy, "PATCH /v1/customers/cus_1")).toEqual([
		{ email: owner.email, name: owner.name },
	]);
});

test("no customer: created with the account's email, name and id after a lookup by email", async () => {
	const spy = stub({ "POST /v1/customers/": customer() });

	await ensurePolarCustomer(owner);

	expect(sent()).toEqual([
		byExternalId,
		expect.stringContaining(
			`GET /v1/customers/?email=${encodeURIComponent(owner.email)}&`,
		),
		"POST /v1/customers/",
	]);
	expect(polarCoreRequests(spy, "POST /v1/customers/")).toEqual([
		{ email: owner.email, name: owner.name, external_id: owner.id },
	]);
});

test("an unlinked customer with the email: linked to the user, nothing created", async () => {
	const spy = stub({
		"GET /v1/customers/": customersWithEmail(customer({ external_id: null })),
		"PATCH /v1/customers/cus_1": customer(),
	});

	await ensurePolarCustomer(owner);

	expect(polarCoreRequests(spy, "PATCH /v1/customers/cus_1")).toEqual([
		{ external_id: owner.id, name: owner.name },
	]);
	expect(polarCoreRequests(spy, "POST /v1/customers/")).toHaveLength(0);
});

test.each([
	["linked to another user", customer({ external_id: "user_other" })],
	["held by a team customer", customer({ type: "team", external_id: "org_1" })],
])("the email %s → 409 BILLING_ACCOUNT_REJECTED, nothing changed", async (_, taken) => {
	stub({ "GET /v1/customers/": customersWithEmail(taken) });

	await expect(ensurePolarCustomer(owner)).rejects.toMatchObject({
		statusCode: 409,
		body: { code: AUTH_ERROR_CODES.BILLING_ACCOUNT_REJECTED },
	});
	expect(sent().filter((route) => !route.startsWith("GET "))).toEqual([]);
});

test("Polar refuses the create → 409 BILLING_ACCOUNT_REJECTED", async () => {
	stub({
		"POST /v1/customers/": Response.json(
			{
				detail: [
					{
						type: "value_error",
						loc: ["body", "email"],
						msg: "Invalid email",
						input: owner.email,
					},
				],
			},
			{ status: 422 },
		),
	});

	await expect(ensurePolarCustomer(owner)).rejects.toMatchObject({
		statusCode: 409,
		body: { code: AUTH_ERROR_CODES.BILLING_ACCOUNT_REJECTED },
	});
});

test("a concurrent ensure created the customer first: the create's external_id conflict is fine", async () => {
	let created = false;
	stub({
		[byExternalId]: () =>
			created
				? customer()
				: Response.json({ error: "ResourceNotFound" }, { status: 404 }),
		"POST /v1/customers/": () => {
			created = true;
			return Response.json(
				{
					detail: [
						{
							type: "value_error",
							loc: ["body", "external_id"],
							msg: "A customer with this external ID already exists.",
							input: owner.id,
						},
					],
				},
				{ status: 422 },
			);
		},
	});

	await ensurePolarCustomer(owner);

	expect(sent().at(-1)).toBe(byExternalId);
});

test("Polar 5xx → 503 BILLING_UNAVAILABLE", async () => {
	stub({
		[byExternalId]: Response.json(
			{ error: "InternalServerError" },
			{ status: 502 },
		),
	});

	await expect(ensurePolarCustomer(owner)).rejects.toMatchObject({
		statusCode: 503,
		body: { code: AUTH_ERROR_CODES.BILLING_UNAVAILABLE },
	});
});

test("Polar timed out or unreachable → 503 BILLING_UNAVAILABLE", async () => {
	polarSpy = stubPolarCore().mockRejectedValue(
		new PolarNetworkError("The operation timed out."),
	);

	await expect(ensurePolarCustomer(owner)).rejects.toMatchObject({
		statusCode: 503,
		body: { code: AUTH_ERROR_CODES.BILLING_UNAVAILABLE },
	});
});

test("deleting a user's customer anonymizes it; a user who never had one is fine", async () => {
	stub({
		[`DELETE /v1/customers/external/${owner.id}`]: Response.json(
			{ error: "ResourceNotFound" },
			{ status: 404 },
		),
	});

	await deletePolarCustomer(owner.id);

	expect(sent()).toEqual([
		`DELETE /v1/customers/external/${owner.id}?anonymize=true`,
	]);
});

test("Polar rate-limits the lookup → 503 BILLING_UNAVAILABLE, not a refusal", async () => {
	stub({
		[byExternalId]: new Response(null, {
			status: 429,
			headers: { "Retry-After": "1" },
		}),
	});

	await expect(ensurePolarCustomer(owner)).rejects.toMatchObject({
		statusCode: 503,
		body: { code: AUTH_ERROR_CODES.BILLING_UNAVAILABLE },
	});
});
