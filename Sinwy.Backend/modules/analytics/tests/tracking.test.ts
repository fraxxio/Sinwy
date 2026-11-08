import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	insertOrganization,
} from "@backend/test/helpers";
import appConfig from "@config";
import db from "@db";
import { analyticsEvent, analyticsSalt } from "@db/schema/analyticsSchema";
import { organization } from "@db/schema/organizationSchema";
import { page } from "@db/schema/pageSchema";
import { user } from "@db/schema/userSchema";
import type { PlanSlug, TrackEventInput } from "@sinwy/shared";
import type { Server } from "bun";
import { asc, eq, sql } from "drizzle-orm";
import { registerPublicAnalyticsRoutes } from "../routes";
import { trackEvent } from "../service";

const DESKTOP =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD =
	"Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const GOOGLEBOT =
	"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerPublicAnalyticsRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

let orgId: string;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	await db.delete(analyticsSalt);
	orgId = await seedOrg("Salon");
});

const seedOrg = async (name: string, plan: PlanSlug | null = "starter") => {
	const id = await insertOrganization(name);
	if (plan) await activateOrganization(id, plan);
	return id;
};

let pageSeq = 0;
const insertPage = async (
	organizationId: string,
	slug: string,
	status: "draft" | "published" = "published",
) => {
	const id = `page_${++pageSeq}`;
	await db.insert(page).values({
		id,
		organizationId,
		slug,
		title: slug,
		status,
		createdAt: new Date(Date.now() + pageSeq),
	});
	return id;
};

const track = (
	event: unknown,
	{
		slug = orgId,
		userAgent = DESKTOP,
		headers = {} as Record<string, string>,
	} = {},
) =>
	fetch(new URL(`/api/public/organizations/${slug}/events`, base), {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"user-agent": userAgent,
			...headers,
		},
		body: typeof event === "string" ? event : JSON.stringify(event),
	});

const events = () =>
	db.select().from(analyticsEvent).orderBy(asc(analyticsEvent.createdAt));

const trackAt = (
	now: Date,
	event: TrackEventInput = { kind: "view" },
	{ slug = orgId, ip = "203.0.113.7", userAgent = DESKTOP } = {},
) => trackEvent({ organizationSlug: slug, event, ip, userAgent }, now);

test("a page view, a booking-page view and a started booking are stored as sent", async () => {
	const pageId = await insertPage(orgId, "about");
	const sent = [
		{
			event: {
				kind: "view",
				pageSlug: "about",
				referrer: "https://www.google.com/search?q=salon",
			},
			userAgent: IPHONE,
		},
		{
			event: { kind: "view", referrer: `${appConfig.WEB_APP_URL}/${orgId}` },
			userAgent: IPAD,
		},
		{ event: { kind: "booking_started" }, userAgent: DESKTOP },
	];
	for (const { event, userAgent } of sent) {
		const res = await track(event, { userAgent });
		expect(res.status).toBe(204);
		expect(await res.text()).toBe("");
	}

	const rows = await events();
	expect(
		rows.map(({ kind, pageId, device, referrerHost, organizationId }) => ({
			kind,
			pageId,
			device,
			referrerHost,
			organizationId,
		})),
	).toEqual([
		{
			kind: "view",
			pageId,
			device: "mobile",
			referrerHost: "www.google.com",
			organizationId: orgId,
		},
		{
			kind: "view",
			pageId: null,
			device: "tablet",
			referrerHost: null,
			organizationId: orgId,
		},
		{
			kind: "booking_started",
			pageId: null,
			device: "desktop",
			referrerHost: null,
			organizationId: orgId,
		},
	]);
});

test("no column holds an IP or a user agent", async () => {
	await trackAt(new Date(), { kind: "view" }, { ip: "198.51.100.23" });

	const [row] = await events();
	const stored = JSON.stringify(row);
	expect(stored).not.toContain("198.51.100.23");
	expect(stored).not.toContain("Chrome");

	const columns = await db.execute<{ column_name: string }>(
		sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'analytics_event'`,
	);
	expect(columns.map((c) => c["column_name"]).sort()).toEqual([
		"created_at",
		"device",
		"id",
		"kind",
		"local_date",
		"organization_id",
		"page_id",
		"referrer_host",
		"visitor_hash",
	]);
});

test("the visitor hash is stable within a day and differs across days and organizations", async () => {
	const otherOrgId = await seedOrg("Barber");
	const day = new Date("2026-03-10T12:00:00Z");
	const nextDay = new Date("2026-03-11T12:00:00Z");

	const hashOf = async (...args: Parameters<typeof trackAt>) => {
		await db.delete(analyticsEvent);
		await trackAt(...args);
		const [row] = await events();
		return row?.visitorHash;
	};

	const first = await hashOf(day);
	expect(await hashOf(new Date("2026-03-10T18:00:00Z"))).toBe(first);
	const others = [
		await hashOf(nextDay),
		await hashOf(day, { kind: "view" }, { slug: otherOrgId }),
		await hashOf(day, { kind: "view" }, { userAgent: IPHONE }),
		await hashOf(day, { kind: "view" }, { ip: "203.0.113.8" }),
	];
	expect(new Set([first, ...others]).size).toBe(5);
});

test("bots, organizations that aren't public and pages that aren't served store nothing", async () => {
	await insertPage(orgId, "served");
	await insertPage(orgId, "over-the-cap");
	await insertPage(orgId, "draft", "draft");
	const inactiveOrgId = await seedOrg("Closed", null);

	const responses = await Promise.all([
		track({ kind: "view" }, { userAgent: GOOGLEBOT }),
		track({ kind: "view" }, { userAgent: "HeadlessChrome/130" }),
		track({ kind: "view" }, { userAgent: "" }),
		track({ kind: "view" }, { slug: "no-such-org" }),
		track({ kind: "view" }, { slug: inactiveOrgId }),
		track({ kind: "view", pageSlug: "over-the-cap" }),
		track({ kind: "view", pageSlug: "draft" }),
		track({ kind: "view", pageSlug: "missing" }),
		track({ kind: "booking_started", pageSlug: "served" }),
		track({ kind: "click" }),
		track("not json"),
	]);

	expect(responses.map((res) => res.status)).toEqual(responses.map(() => 204));
	expect(await events()).toEqual([]);
});

test("unpublishing a page stops its views being counted", async () => {
	const pageId = await insertPage(orgId, "about");
	await track({ kind: "view", pageSlug: "about" });
	await db.update(page).set({ status: "draft" }).where(eq(page.id, pageId));
	await track({ kind: "view", pageSlug: "about" });

	expect(await events()).toHaveLength(1);
});

test("the local date follows the organization's timezone around midnight", async () => {
	const eastId = await seedOrg("Auckland");
	const westId = await seedOrg("New York");
	await db
		.update(organization)
		.set({ timezone: "Pacific/Auckland" })
		.where(eq(organization.id, eastId));
	await db
		.update(organization)
		.set({ timezone: "America/New_York" })
		.where(eq(organization.id, westId));

	const justAfterUtcMidnight = new Date("2026-03-11T00:30:00Z");
	const justBeforeUtcMidnight = new Date("2026-03-10T23:30:00Z");
	await trackAt(justAfterUtcMidnight, { kind: "view" }, { slug: westId });
	await trackAt(justBeforeUtcMidnight, { kind: "view" }, { slug: eastId });
	await trackAt(justBeforeUtcMidnight);

	const dates = Object.fromEntries(
		(await events()).map((row) => [row.organizationId, row.localDate]),
	);
	expect(dates).toEqual({
		[westId]: "2026-03-10",
		[eastId]: "2026-03-11",
		[orgId]: "2026-03-10",
	});
});

test("the trusted proxy header is honoured only when configured", async () => {
	const configured = appConfig.TRUSTED_PROXY_HEADER;
	const fromTwoClients = async () => {
		await db.delete(analyticsEvent);
		for (const ip of ["198.51.100.1", "198.51.100.2"])
			await track(
				{ kind: "view" },
				{ headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } },
			);
		return new Set((await events()).map((row) => row.visitorHash)).size;
	};

	try {
		appConfig.TRUSTED_PROXY_HEADER = "x-forwarded-for";
		expect(await fromTwoClients()).toBe(2);

		appConfig.TRUSTED_PROXY_HEADER = undefined;
		expect(await fromTwoClients()).toBe(1);
	} finally {
		appConfig.TRUSTED_PROXY_HEADER = configured;
	}
});

test("deleting a page deletes its events", async () => {
	const pageId = await insertPage(orgId, "about");
	await track({ kind: "view", pageSlug: "about" });
	await track({ kind: "view" });

	await db.delete(page).where(eq(page.id, pageId));

	expect((await events()).map((row) => row.pageId)).toEqual([null]);
});

test("every instance agrees on the day's salt", async () => {
	const now = new Date("2026-03-10T12:00:00Z");
	await Promise.all([trackAt(now), trackAt(now), trackAt(now)]);

	expect(new Set((await events()).map((row) => row.visitorHash)).size).toBe(1);
	expect(await db.select().from(analyticsSalt)).toHaveLength(1);
});
