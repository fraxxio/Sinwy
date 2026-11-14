import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import { readOutboxEmails } from "@backend/infrastructure/email";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { booking } from "@db/schema/bookingSchema";
import { notification } from "@db/schema/notificationSchema";
import {
	memberNotificationPreference,
	organization,
} from "@db/schema/organizationSchema";
import { payment } from "@db/schema/paymentSchema";
import { service } from "@db/schema/serviceSchema";
import { user } from "@db/schema/userSchema";
import {
	API_ERROR_CODES,
	type ApiResponse,
	type CustomerPaymentDetailDto,
	type CustomerPaymentListDto,
	type PaymentDto,
	type PaymentListDto,
	type PaymentStatus,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerAccountPaymentRoutes, registerPaymentRoutes } from "../routes";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerPaymentRoutes(app);
	registerAccountPaymentRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

type Session = { userId: string; cookie: string };

let orgId: string;
let otherOrgId: string;
let owner: Session;
let customer: Session;

const TIMEZONE = "Europe/Vilnius";

const createOrganization = async (name: string, ownerId: string) => {
	const id = await insertOrganization(name);
	await joinOrganization(id, ownerId, "owner");
	await activateOrganization(id);
	await db
		.update(organization)
		.set({ timezone: TIMEZONE })
		.where(eq(organization.id, id));
	return id;
};

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	owner = await createUserWithSession();
	customer = await createUserWithSession();
	orgId = await createOrganization("Salon", owner.userId);
	otherOrgId = await createOrganization("Other", owner.userId);
});

type PaymentSeed = {
	organizationId?: string;
	createdAt?: Date;
	status?: PaymentStatus;
	amountMinor?: number;
	currency?: string;
	customerUserId?: string | null;
	customerName?: string;
	customerEmail?: string | null | undefined;
};

/** Rows inserted directly: raw booking inserts get no payment from the bookings module. */
const insertPayment = async (seed: PaymentSeed = {}) => {
	const organizationId = seed.organizationId ?? orgId;
	const serviceId = crypto.randomUUID();
	const bookingId = crypto.randomUUID();
	const id = crypto.randomUUID();
	const amountMinor = seed.amountMinor ?? 2500;
	const currency = seed.currency ?? "EUR";
	const status = seed.status ?? "pending";
	const startsAt = new Date("2026-12-01T10:00:00Z");
	await db.insert(service).values({
		id: serviceId,
		organizationId,
		name: "Haircut",
		slug: serviceId,
		durationMinutes: 30,
		priceMinor: amountMinor,
		currency,
	});
	await db.insert(booking).values({
		id: bookingId,
		organizationId,
		serviceId,
		bookedBy: seed.customerUserId === null ? "organization" : "customer",
		customerUserId:
			seed.customerUserId === undefined ? customer.userId : seed.customerUserId,
		customerName: seed.customerName ?? "Ada Customer",
		customerEmail: seed.customerEmail ?? null,
		startsAt,
		endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
		bufferBeforeMinutes: 0,
		bufferAfterMinutes: 0,
		priceMinor: amountMinor,
		currency,
		status: "confirmed",
	});
	const createdAt = seed.createdAt ?? new Date();
	await db.insert(payment).values({
		id,
		organizationId,
		bookingId,
		amountMinor,
		currency,
		status,
		provider: "manual",
		paidAt: status === "paid" ? createdAt : null,
		createdAt,
		updatedAt: createdAt,
	});
	return id;
};

const request = (cookie: string, method: string, path: string) =>
	fetch(new URL(path, base), { method, headers: { cookie } });

const org = (as: Session, method: string, path: string, id = orgId) =>
	request(as.cookie, method, `/api/organizations/${id}/payments${path}`);

const account = (as: Session, path = "") =>
	request(as.cookie, "GET", `/api/account/payments${path}`);

const unwrap = async <T>(res: Response) => {
	const body = (await res.json()) as ApiResponse<T>;
	if (!body.isSuccess) throw new Error(`request failed: ${body.message}`);
	return body.data;
};

const errorCode = async (res: Response) =>
	((await res.json()) as ApiResponse<never>).code;

const statusOf = async (id: string) => {
	const [row] = await db
		.select({ status: payment.status, paidAt: payment.paidAt })
		.from(payment)
		.where(eq(payment.id, id));
	return row;
};

const MARCH = "?from=2026-03-01&to=2026-03-31";

test("the list defaults to the current month and shows only this organization's payments", async () => {
	const mine = await insertPayment();
	await insertPayment({ organizationId: otherOrgId });
	await insertPayment({
		createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
	});

	const list = await unwrap<PaymentListDto>(await org(owner, "GET", ""));
	const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(
		new Date(),
	);
	expect(list.from).toBe(`${today.slice(0, 7)}-01`);
	expect(list.to).toBe(today);
	expect(list.items.map((item) => item.id)).toEqual([mine]);
	expect(list.total).toBe(1);
	expect(list.items[0]).toMatchObject({
		status: "pending",
		provider: "manual",
		amountMinor: 2500,
		currency: "EUR",
		customerName: "Ada Customer",
		serviceName: "Haircut",
		paidAt: null,
	});
});

test("the range is org-local and inclusive on both ends", async () => {
	// Vilnius is UTC+2 in early March
	const before = await insertPayment({
		createdAt: new Date("2026-02-28T21:30:00Z"),
	});
	const first = await insertPayment({
		createdAt: new Date("2026-02-28T22:30:00Z"),
	});
	const last = await insertPayment({
		createdAt: new Date("2026-03-10T21:30:00Z"),
	});
	const after = await insertPayment({
		createdAt: new Date("2026-03-10T22:30:00Z"),
	});

	const list = await unwrap<PaymentListDto>(
		await org(owner, "GET", "?from=2026-03-01&to=2026-03-10"),
	);
	const ids = list.items.map((item) => item.id);
	expect(ids).toEqual([last, first]);
	expect(ids).not.toContain(before);
	expect(ids).not.toContain(after);
});

test("totals cover the whole range, split by currency, without void payments", async () => {
	const at = (day: number) => new Date(Date.UTC(2026, 2, day, 12));
	await insertPayment({ createdAt: at(2), status: "paid", amountMinor: 2500 });
	await insertPayment({ createdAt: at(3), amountMinor: 8000 });
	await insertPayment({ createdAt: at(4), amountMinor: 1000 });
	await insertPayment({ createdAt: at(5), status: "void", amountMinor: 9900 });
	await insertPayment({
		createdAt: at(6),
		status: "paid",
		amountMinor: 3000,
		currency: "USD",
	});
	await insertPayment({
		createdAt: at(7),
		status: "void",
		amountMinor: 500,
		currency: "GBP",
	});
	await insertPayment({
		organizationId: otherOrgId,
		createdAt: at(8),
		amountMinor: 7700,
	});

	const list = await unwrap<PaymentListDto>(
		await org(owner, "GET", `${MARCH}&pageSize=1`),
	);
	expect(list.items).toHaveLength(1);
	expect(list.total).toBe(6);
	expect(list.totals).toEqual([
		{ currency: "EUR", paidMinor: 2500, pendingMinor: 9000, count: 3 },
		{ currency: "USD", paidMinor: 3000, pendingMinor: 0, count: 1 },
	]);
});

test("a reversed range is refused", async () => {
	const res = await org(owner, "GET", "?from=2026-03-10&to=2026-03-01");
	expect(res.status).toBe(400);
});

test("the CSV export lists the range with escaped and neutralised cells", async () => {
	const at = (day: number, hour = 12) => new Date(Date.UTC(2026, 2, day, hour));
	await insertPayment({
		createdAt: at(2),
		status: "paid",
		customerName: 'Ada "The Count" Lovelace',
	});
	await insertPayment({ createdAt: at(3), customerName: "=HYPERLINK(1)" });
	await insertPayment({ createdAt: at(4), customerName: "-1+2" });
	await insertPayment({ createdAt: at(4, 13), customerName: "\t@SUM(A1)" });
	await insertPayment({ createdAt: new Date(Date.UTC(2026, 3, 2, 12)) });
	await insertPayment({ organizationId: otherOrgId, createdAt: at(5) });

	const res = await org(owner, "GET", `/export${MARCH}`);
	expect(res.status).toBe(200);
	expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
	expect(res.headers.get("content-disposition")).toBe(
		'attachment; filename="payments-2026-03-01-to-2026-03-31.csv"',
	);
	const lines = (await res.text()).trimEnd().split("\r\n");
	expect(lines).toEqual([
		'"Created","Paid on","Customer","Service","Appointment","Amount","Currency","Status","Provider","Reference"',
		`"2026-03-04T15:00:00+02:00","","'\t@SUM(A1)","Haircut","2026-12-01T12:00:00+02:00","25.00","EUR","pending","manual",""`,
		`"2026-03-04T14:00:00+02:00","","'-1+2","Haircut","2026-12-01T12:00:00+02:00","25.00","EUR","pending","manual",""`,
		`"2026-03-03T14:00:00+02:00","","'=HYPERLINK(1)","Haircut","2026-12-01T12:00:00+02:00","25.00","EUR","pending","manual",""`,
		`"2026-03-02T14:00:00+02:00","2026-03-02T14:00:00+02:00","Ada ""The Count"" Lovelace","Haircut","2026-12-01T12:00:00+02:00","25.00","EUR","paid","manual",""`,
	]);
});

test("mark as paid sets paid and paidAt once; a second call or a void payment is 409", async () => {
	const pending = await insertPayment();
	const voided = await insertPayment({ status: "void" });

	const res = await org(owner, "POST", `/${pending}/mark-paid`);
	expect(res.status).toBe(200);
	const marked = await unwrap<PaymentDto>(res);
	expect(marked.status).toBe("paid");
	expect(marked.paidAt).not.toBeNull();
	const row = await statusOf(pending);
	expect(row?.status).toBe("paid");
	expect(row?.paidAt).toBeInstanceOf(Date);

	for (const id of [pending, voided]) {
		const again = await org(owner, "POST", `/${id}/mark-paid`);
		expect(again.status).toBe(409);
		expect(await errorCode(again)).toBe(
			API_ERROR_CODES.PAYMENT_STATUS_CHANGE_NOT_ALLOWED,
		);
	}
	expect((await statusOf(voided))?.status).toBe("void");
});

test("another organization's or an unknown payment can't be marked as paid", async () => {
	const theirs = await insertPayment({ organizationId: otherOrgId });

	for (const id of [theirs, "missing"]) {
		const res = await org(owner, "POST", `/${id}/mark-paid`);
		expect(res.status).toBe(404);
	}
	expect((await statusOf(theirs))?.status).toBe("pending");
});

test("an inactive organization keeps its list and export but refuses mark as paid", async () => {
	const id = await insertPayment();
	await db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(eq(organization.id, orgId));

	expect((await org(owner, "GET", "")).status).toBe(200);
	expect((await org(owner, "GET", "/export")).status).toBe(200);
	const res = await org(owner, "POST", `/${id}/mark-paid`);
	expect(res.status).toBe(409);
	expect(await errorCode(res)).toBe(API_ERROR_CODES.ORGANIZATION_INACTIVE);
	expect((await statusOf(id))?.status).toBe("pending");
});

test("staff can't read or mark payments; admins can mark them as paid", async () => {
	const id = await insertPayment();
	const admin = await createUserWithSession();
	const staff = await createUserWithSession();
	await joinOrganization(orgId, admin.userId, "admin");
	await joinOrganization(orgId, staff.userId, "staff");

	for (const res of await Promise.all([
		org(staff, "GET", ""),
		org(staff, "GET", "/export"),
		org(staff, "POST", `/${id}/mark-paid`),
	]))
		expect(res.status).toBe(403);
	expect((await statusOf(id))?.status).toBe("pending");

	expect((await org(admin, "POST", `/${id}/mark-paid`)).status).toBe(200);
	expect((await statusOf(id))?.status).toBe("paid");
});

test("marking as paid emails the opted-in owner and admins, never the actor or staff", async () => {
	const id = await insertPayment();
	const [actor, quietAdmin, staff] = await Promise.all([
		createUserWithSession(),
		createUserWithSession(),
		createUserWithSession(),
	]);
	await joinOrganization(orgId, actor.userId, "admin");
	await joinOrganization(orgId, quietAdmin.userId, "admin");
	await joinOrganization(orgId, staff.userId, "staff");
	// staff can't opt in through the API; a row written anyway must not count
	await db.insert(memberNotificationPreference).values(
		[owner, actor, staff].map(({ userId }) => ({
			memberId: `member_${userId}_${orgId}`,
			emailPaymentRecorded: true,
		})),
	);
	const since = Date.now();

	expect((await org(actor, "POST", `/${id}/mark-paid`)).status).toBe(200);

	const subjects = async ({ userId }: Session) =>
		(await readOutboxEmails())
			.map(({ email }) => email)
			.filter(
				(email) =>
					email.to === `${userId}@test.dev` &&
					Date.parse(email.sentAt) >= since,
			)
			.map((email) => email.subject);
	expect(await subjects(owner)).toEqual([
		"Payment recorded: €25.00 for Haircut",
	]);
	for (const quiet of [actor, quietAdmin, staff])
		expect(await subjects(quiet)).toEqual([]);

	// in the app, every owner and admin hears of it whatever their email choice
	const notified = await db
		.select({ userId: notification.userId, type: notification.type })
		.from(notification);
	expect(notified.map((row) => row.userId).sort()).toEqual(
		[owner.userId, quietAdmin.userId].sort(),
	);
	expect(notified.every((row) => row.type === "payment.recorded")).toBe(true);
});

test("someone outside the organization can't read or mark its payments", async () => {
	const id = await insertPayment();
	const outsider = await createUserWithSession();
	await createOrganization("Elsewhere", outsider.userId);

	for (const res of await Promise.all([
		org(outsider, "GET", ""),
		org(outsider, "GET", "/export"),
		org(outsider, "POST", `/${id}/mark-paid`),
	]))
		expect(res.status).toBe(404);
	expect((await statusOf(id))?.status).toBe("pending");
});

test("customers see their own non-void payments, newest first", async () => {
	const older = await insertPayment({
		organizationId: otherOrgId,
		createdAt: new Date("2026-03-01T12:00:00Z"),
		status: "paid",
	});
	const newer = await insertPayment({
		createdAt: new Date("2026-03-02T12:00:00Z"),
	});
	await insertPayment({ status: "void" });
	await insertPayment({
		customerUserId: (await createUserWithSession()).userId,
	});
	const [row] = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, customer.userId));
	await insertPayment({ customerUserId: null, customerEmail: row?.email });

	const list = await unwrap<CustomerPaymentListDto>(await account(customer));
	expect(list.total).toBe(2);
	expect(list.items.map((item) => item.id)).toEqual([newer, older]);
	expect(list.items[0]).toMatchObject({
		status: "pending",
		serviceName: "Haircut",
		organization: { name: "Salon", slug: orgId, timezone: TIMEZONE },
	});
});

test("a payment's detail is only for its customer, and never for a void one", async () => {
	const mine = await insertPayment({ status: "paid" });
	const voided = await insertPayment({ status: "void" });
	const someone = await createUserWithSession();

	const detail = await unwrap<CustomerPaymentDetailDto>(
		await account(customer, `/${mine}`),
	);
	expect(detail).toMatchObject({
		id: mine,
		status: "paid",
		customerName: "Ada Customer",
		amountMinor: 2500,
	});
	expect(detail.paidAt).not.toBeNull();

	expect((await account(someone, `/${mine}`)).status).toBe(404);
	expect((await account(customer, `/${voided}`)).status).toBe(404);
	expect((await fetch(new URL("/api/account/payments", base))).status).toBe(
		401,
	);
});
