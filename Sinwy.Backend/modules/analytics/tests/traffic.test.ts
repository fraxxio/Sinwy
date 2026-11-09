import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { type Membership, registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import { addDaysToDate } from "@backend/lib/localDate";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { analyticsDaily, analyticsPageDaily } from "@db/schema/analyticsSchema";
import { organization } from "@db/schema/organizationSchema";
import { page } from "@db/schema/pageSchema";
import { user } from "@db/schema/userSchema";
import { todayIn } from "@servicesModule";
import {
	type AnalyticsDailyMetric,
	API_ERROR_CODES,
	type ApiResponse,
	type PlanSlug,
	type TrafficBreakdownDto,
	type TrafficDto,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { resolveAnalyticsRange } from "../range";
import { registerAnalyticsRoutes } from "../routes";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerAnalyticsRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

// UTC+2 in winter, so 23:30 UTC is already the next day there
const TIMEZONE = "Europe/Vilnius";

type Session = { userId: string; cookie: string };

let owner: Session;
let orgId: string;

const createOrganization = async (
	ownerId: string,
	plan: PlanSlug | null = "professional",
) => {
	const id = await insertOrganization("Salon");
	await joinOrganization(id, ownerId, "owner");
	if (plan) await activateOrganization(id, plan);
	await db
		.update(organization)
		.set({ timezone: TIMEZONE, currency: "USD" })
		.where(eq(organization.id, id));
	return id;
};

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	owner = await createUserWithSession();
	orgId = await createOrganization(owner.userId);
});

const membership = (plan: PlanSlug | null): Membership => ({
	organizationId: orgId,
	roles: ["owner"],
	status: plan ? "active" : "inactive",
	plan,
});

const resolve = async (
	plan: PlanSlug | null,
	query: { from?: string; to?: string },
	now: Date,
) => {
	const result = await resolveAnalyticsRange(membership(plan), query, now);
	if (!result.ok) throw new Error(result.error);
	return result.data;
};

const NOW = new Date("2026-03-10T23:30:00Z");
const LOCAL_YESTERDAY = "2026-03-10";

test("the default range is the last 30 complete days in the organization's timezone", async () => {
	expect(await resolve("starter", {}, NOW)).toEqual({
		from: "2026-02-09",
		to: LOCAL_YESTERDAY,
		timezone: TIMEZONE,
		currency: "USD",
		retentionDays: 30,
		clamped: false,
	});
});

test("a range reaching today or later ends yesterday", async () => {
	const range = await resolve(
		"professional",
		{ from: "2026-03-01", to: "2026-04-30" },
		NOW,
	);
	expect([range.from, range.to]).toEqual(["2026-03-01", LOCAL_YESTERDAY]);

	const future = await resolve(
		"professional",
		{ from: "2026-03-20", to: "2026-03-25" },
		NOW,
	);
	expect([future.from, future.to]).toEqual([LOCAL_YESTERDAY, LOCAL_YESTERDAY]);
});

test("only `to` given: the 30 days up to it", async () => {
	const range = await resolve("professional", { to: "2026-01-31" }, NOW);
	expect([range.from, range.to]).toEqual(["2026-01-02", "2026-01-31"]);
});

test.each([
	["starter", 30, "2026-02-09"],
	["professional", 365, "2025-03-11"],
	["enterprise", 730, "2024-03-11"],
] as const)("%s reaches back %i days", async (plan, days, earliest) => {
	const range = await resolve(plan, { from: "2020-01-01" }, NOW);
	expect(range).toMatchObject({
		from: earliest,
		to: LOCAL_YESTERDAY,
		retentionDays: days,
		clamped: true,
	});
	expect(addDaysToDate(range.from, days - 1)).toBe(range.to);
});

test("a range wholly before the retention window collapses onto its first day", async () => {
	const range = await resolve(
		"starter",
		{ from: "2025-01-01", to: "2025-01-31" },
		NOW,
	);
	expect(range).toMatchObject({
		from: "2026-02-09",
		to: "2026-02-09",
		clamped: true,
	});
});

test("no plan has no retention", async () => {
	expect(await resolveAnalyticsRange(membership(null), {}, NOW)).toEqual({
		ok: false,
		error: "no-retention",
	});
});

// The endpoints run on the real clock, so their rows are dated relative to it.
const yesterday = () => addDaysToDate(todayIn(TIMEZONE, new Date()), -1);
const daysAgo = (days: number) => addDaysToDate(yesterday(), 1 - days);

type DailySeed = {
	organizationId?: string;
	localDate?: string;
	metric?: AnalyticsDailyMetric;
	key?: string;
	events: number;
	visitors: number;
};

const insertDaily = (rows: DailySeed[]) =>
	db.insert(analyticsDaily).values(
		rows.map((row) => ({
			organizationId: row.organizationId ?? orgId,
			localDate: row.localDate ?? yesterday(),
			metric: row.metric ?? "total",
			key: row.key ?? "",
			events: row.events,
			visitors: row.visitors,
		})),
	);

let pageSeq = 0;
const insertPage = async (organizationId: string, title: string) => {
	const id = `page_traffic_${++pageSeq}`;
	await db.insert(page).values({
		id,
		organizationId,
		slug: `slug-${pageSeq}`,
		title,
		status: "published",
	});
	return id;
};

const get = async <T>(
	path: string,
	session: Session = owner,
	organizationId = orgId,
) => {
	const response = await fetch(
		new URL(`/api/organizations/${organizationId}/analytics/${path}`, base),
		{ headers: { cookie: session.cookie } },
	);
	return {
		status: response.status,
		body: (await response.json()) as ApiResponse<T>,
	};
};

const dataOf = <T>(body: ApiResponse<T>) => {
	if (!body.isSuccess) throw new Error(body.message);
	return body.data;
};

test("traffic sums the daily totals and fills days without events with zeros", async () => {
	const otherOrg = await createOrganization(owner.userId);
	await insertDaily([
		{ localDate: daysAgo(3), events: 10, visitors: 4 },
		{ localDate: daysAgo(1), events: 5, visitors: 3 },
		{
			localDate: daysAgo(1),
			metric: "booking_started",
			events: 2,
			visitors: 2,
		},
		{
			localDate: daysAgo(1),
			metric: "device",
			key: "mobile",
			events: 5,
			visitors: 3,
		},
		{ localDate: todayIn(TIMEZONE, new Date()), events: 99, visitors: 99 },
		{
			organizationId: otherOrg,
			localDate: daysAgo(2),
			events: 50,
			visitors: 50,
		},
	]);

	const { status, body } = await get<TrafficDto>(
		`traffic?from=${daysAgo(4)}&to=${yesterday()}`,
	);
	expect(status).toBe(200);
	const traffic = dataOf(body);
	expect(traffic.range).toMatchObject({
		from: daysAgo(4),
		to: yesterday(),
		timezone: TIMEZONE,
		retentionDays: 365,
	});
	expect(traffic.totals).toEqual({ views: 15, visitors: 7 });
	expect(traffic.series).toEqual([
		{ date: daysAgo(4), views: 0, visitors: 0 },
		{ date: daysAgo(3), views: 10, visitors: 4 },
		{ date: daysAgo(2), views: 0, visitors: 0 },
		{ date: daysAgo(1), views: 5, visitors: 3 },
	]);
});

test("traffic defaults to 30 days and refuses a bad range", async () => {
	const traffic = dataOf((await get<TrafficDto>("traffic")).body);
	expect(traffic.series).toHaveLength(30);
	expect(traffic.range).toMatchObject({ from: daysAgo(30), to: yesterday() });

	const reversed = await get(`traffic?from=${yesterday()}&to=${daysAgo(5)}`);
	expect(reversed.status).toBe(400);
});

test("the breakdown lists pages, referrers and devices of this organization only", async () => {
	const aboutId = await insertPage(orgId, "About us");
	const pricesId = await insertPage(orgId, "Prices");
	const otherOrg = await createOrganization(owner.userId);
	const otherPage = await insertPage(otherOrg, "Elsewhere");
	await db.insert(analyticsPageDaily).values([
		{
			organizationId: orgId,
			localDate: daysAgo(2),
			pageId: aboutId,
			views: 3,
			visitors: 2,
		},
		{
			organizationId: orgId,
			localDate: daysAgo(1),
			pageId: aboutId,
			views: 4,
			visitors: 3,
		},
		{
			organizationId: orgId,
			localDate: daysAgo(1),
			pageId: null,
			views: 6,
			visitors: 4,
		},
		{
			organizationId: orgId,
			localDate: daysAgo(1),
			pageId: pricesId,
			views: 1,
			visitors: 1,
		},
		{
			organizationId: orgId,
			localDate: daysAgo(40),
			pageId: pricesId,
			views: 100,
			visitors: 100,
		},
		{
			organizationId: otherOrg,
			localDate: daysAgo(1),
			pageId: otherPage,
			views: 50,
			visitors: 50,
		},
	]);
	await insertDaily([
		{ metric: "referrer", key: "", events: 5, visitors: 3 },
		{ metric: "referrer", key: "www.google.com", events: 4, visitors: 3 },
		{
			metric: "referrer",
			key: "google.com",
			localDate: daysAgo(2),
			events: 3,
			visitors: 2,
		},
		{ metric: "referrer", key: "facebook.com", events: 2, visitors: 1 },
		{ metric: "device", key: "desktop", events: 8, visitors: 5 },
		{ metric: "device", key: "mobile", events: 6, visitors: 4 },
		{
			organizationId: otherOrg,
			metric: "referrer",
			key: "spam.example",
			events: 50,
			visitors: 50,
		},
		{
			organizationId: otherOrg,
			metric: "device",
			key: "tablet",
			events: 50,
			visitors: 50,
		},
	]);

	const { status, body } = await get<TrafficBreakdownDto>("traffic/breakdown");
	expect(status).toBe(200);
	const breakdown = dataOf(body);
	expect(breakdown.pages).toEqual([
		{
			pageId: aboutId,
			title: "About us",
			slug: expect.any(String),
			views: 7,
			visitors: 5,
		},
		{ pageId: null, title: null, slug: null, views: 6, visitors: 4 },
		{
			pageId: pricesId,
			title: "Prices",
			slug: expect.any(String),
			views: 1,
			visitors: 1,
		},
	]);
	expect(breakdown.referrers).toEqual([
		{ host: "google.com", views: 7, visitors: 5 },
		{ host: null, views: 5, visitors: 3 },
		{ host: "facebook.com", views: 2, visitors: 1 },
	]);
	expect(breakdown.devices).toEqual([
		{ device: "desktop", views: 8, visitors: 5 },
		{ device: "mobile", views: 6, visitors: 4 },
	]);
});

test("another organization's analytics stay hidden from a non-member", async () => {
	const stranger = await createUserWithSession();
	const traffic = await get("traffic", stranger);
	expect(traffic.status).toBe(404);
	const breakdown = await get("traffic/breakdown", stranger);
	expect(breakdown.status).toBe(404);
});

test("staff can't read analytics", async () => {
	const staff = await createUserWithSession();
	await joinOrganization(orgId, staff.userId, "staff");
	expect((await get("traffic", staff)).status).toBe(403);
	expect((await get("traffic/breakdown", staff)).status).toBe(403);
});

test("an admin reads both", async () => {
	const admin = await createUserWithSession();
	await joinOrganization(orgId, admin.userId, "admin");
	expect((await get("traffic", admin)).status).toBe(200);
	expect((await get("traffic/breakdown", admin)).status).toBe(200);
});

test("Starter gets the totals but not the breakdown", async () => {
	await activateOrganization(orgId, "starter");
	const traffic = await get<TrafficDto>("traffic?from=2020-01-01");
	expect(traffic.status).toBe(200);
	expect(dataOf(traffic.body).range).toMatchObject({
		from: daysAgo(30),
		retentionDays: 30,
		clamped: true,
	});

	const breakdown = await get("traffic/breakdown");
	expect(breakdown.status).toBe(402);
	expect(breakdown.body).toMatchObject({
		code: API_ERROR_CODES.PLAN_UPGRADE_REQUIRED,
	});
});

test("an inactive organization gets 402 everywhere", async () => {
	const inactive = await createOrganization(owner.userId, null);
	for (const path of ["traffic", "traffic/breakdown"]) {
		const { status, body } = await get(path, owner, inactive);
		expect(status).toBe(402);
		expect(body).toMatchObject({
			code: API_ERROR_CODES.PLAN_UPGRADE_REQUIRED,
		});
	}
});
