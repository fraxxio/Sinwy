import { beforeEach, expect, test } from "bun:test";
import { insertOrganization } from "@backend/test/helpers";
import db from "@db";
import {
	analyticsDaily,
	analyticsEvent,
	analyticsPageDaily,
	analyticsSalt,
} from "@db/schema/analyticsSchema";
import { organization } from "@db/schema/organizationSchema";
import { page } from "@db/schema/pageSchema";
import { user } from "@db/schema/userSchema";
import type { AnalyticsEventKind, DeviceType } from "@sinwy/shared";
import { asc, eq, sql } from "drizzle-orm";
import { rollupAnalytics } from "../rollup";

const NOW = new Date("2026-03-10T12:00:00Z");
const TODAY = "2026-03-10";
const YESTERDAY = "2026-03-09";

let orgId: string;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	await db.delete(analyticsSalt);
	orgId = await insertOrganization("Salon");
});

let pageSeq = 0;
const insertPage = async (organizationId: string, slug: string) => {
	const id = `page_rollup_${++pageSeq}`;
	await db.insert(page).values({
		id,
		organizationId,
		slug,
		title: slug,
		status: "published",
		createdAt: new Date(Date.now() + pageSeq),
	});
	return id;
};

type RawEvent = {
	organizationId?: string;
	localDate?: string;
	kind?: AnalyticsEventKind;
	pageId?: string | null;
	visitor?: string;
	referrerHost?: string | null;
	device?: DeviceType;
};

const insertEvents = (events: RawEvent[]) =>
	db.insert(analyticsEvent).values(
		events.map((event) => ({
			id: crypto.randomUUID(),
			organizationId: event.organizationId ?? orgId,
			localDate: event.localDate ?? YESTERDAY,
			kind: event.kind ?? "view",
			pageId: event.pageId ?? null,
			visitorHash: event.visitor ?? "a",
			referrerHost: event.referrerHost ?? null,
			device: event.device ?? "desktop",
		})),
	);

const daily = async () =>
	(await db.select().from(analyticsDaily))
		.map(
			({ organizationId, localDate, metric, key, events, visitors }) =>
				`${organizationId} ${localDate} ${metric}:${key} ${events}/${visitors}`,
		)
		.sort();

const pageDaily = async () =>
	(await db.select().from(analyticsPageDaily))
		.map(
			({ organizationId, localDate, pageId, views, visitors }) =>
				`${organizationId} ${localDate} ${pageId ?? "booking"} ${views}/${visitors}`,
		)
		.sort();

const rawDates = async () =>
	(
		await db
			.select({
				organizationId: analyticsEvent.organizationId,
				localDate: analyticsEvent.localDate,
			})
			.from(analyticsEvent)
	)
		.map(({ organizationId, localDate }) => `${organizationId} ${localDate}`)
		.sort();

test("each metric and page gets its event count and distinct visitors", async () => {
	const aboutId = await insertPage(orgId, "about");
	await insertEvents([
		{
			visitor: "a",
			pageId: aboutId,
			device: "mobile",
			referrerHost: "www.google.com",
		},
		{
			visitor: "a",
			pageId: aboutId,
			device: "mobile",
			referrerHost: "www.google.com",
		},
		{ visitor: "b", pageId: aboutId, device: "desktop" },
		{ visitor: "b", device: "desktop" },
		{ visitor: "c", device: "tablet", referrerHost: "bing.com" },
		{ visitor: "b", kind: "booking_started" },
		{ visitor: "b", kind: "booking_started" },
		{ visitor: "c", kind: "booking_started", device: "tablet" },
	]);

	expect(await rollupAnalytics(NOW)).toEqual({
		events: 8,
		dailyRows: 8,
		pageRows: 2,
		salts: 0,
	});

	expect(await daily()).toEqual(
		[
			`${orgId} ${YESTERDAY} booking_started: 3/2`,
			`${orgId} ${YESTERDAY} device:desktop 2/1`,
			`${orgId} ${YESTERDAY} device:mobile 2/1`,
			`${orgId} ${YESTERDAY} device:tablet 1/1`,
			`${orgId} ${YESTERDAY} referrer: 2/1`,
			`${orgId} ${YESTERDAY} referrer:bing.com 1/1`,
			`${orgId} ${YESTERDAY} referrer:www.google.com 2/1`,
			`${orgId} ${YESTERDAY} total: 5/3`,
		].sort(),
	);
	expect(await pageDaily()).toEqual(
		[
			`${orgId} ${YESTERDAY} ${aboutId} 3/2`,
			`${orgId} ${YESTERDAY} booking 2/2`,
		].sort(),
	);
	expect(await rawDates()).toEqual([]);
});

test("days are counted per organization and per date", async () => {
	const otherId = await insertOrganization("Barber");
	await insertEvents([
		{ visitor: "a", localDate: "2026-03-08" },
		{ visitor: "a" },
		{ visitor: "a", organizationId: otherId },
	]);

	await rollupAnalytics(NOW);

	expect(await daily()).toEqual(
		[
			`${orgId} 2026-03-08 device:desktop 1/1`,
			`${orgId} 2026-03-08 referrer: 1/1`,
			`${orgId} 2026-03-08 total: 1/1`,
			`${orgId} ${YESTERDAY} device:desktop 1/1`,
			`${orgId} ${YESTERDAY} referrer: 1/1`,
			`${orgId} ${YESTERDAY} total: 1/1`,
			`${otherId} ${YESTERDAY} device:desktop 1/1`,
			`${otherId} ${YESTERDAY} referrer: 1/1`,
			`${otherId} ${YESTERDAY} total: 1/1`,
		].sort(),
	);
});

test("today in the organization's timezone is left alone", async () => {
	const aucklandId = await insertOrganization("Auckland");
	const newYorkId = await insertOrganization("New York");
	await db
		.update(organization)
		.set({ timezone: "Pacific/Auckland" })
		.where(eq(organization.id, aucklandId));
	await db
		.update(organization)
		.set({ timezone: "America/New_York" })
		.where(eq(organization.id, newYorkId));
	// 00:30 on 11 March in Auckland, 07:30 on 10 March in New York
	const justAfterAucklandMidnight = new Date("2026-03-10T11:30:00Z");
	await insertEvents(
		[orgId, aucklandId, newYorkId].flatMap((organizationId) =>
			["2026-03-09", "2026-03-10", "2026-03-11"].map((localDate) => ({
				organizationId,
				localDate,
			})),
		),
	);

	await rollupAnalytics(justAfterAucklandMidnight);

	expect(await rawDates()).toEqual(
		[
			`${orgId} 2026-03-10`,
			`${orgId} 2026-03-11`,
			`${aucklandId} 2026-03-11`,
			`${newYorkId} 2026-03-10`,
			`${newYorkId} 2026-03-11`,
		].sort(),
	);
	const totals = (await daily()).filter((row) => row.includes(" total:"));
	expect(totals).toEqual(
		[
			`${orgId} 2026-03-09 total: 1/1`,
			`${aucklandId} 2026-03-09 total: 1/1`,
			`${aucklandId} 2026-03-10 total: 1/1`,
			`${newYorkId} 2026-03-09 total: 1/1`,
		].sort(),
	);
});

test("a second run changes nothing", async () => {
	await insertEvents([{ visitor: "a" }, { visitor: "b", localDate: TODAY }]);
	await rollupAnalytics(NOW);
	const before = [await daily(), await pageDaily(), await rawDates()];

	expect(await rollupAnalytics(NOW)).toEqual({
		events: 0,
		dailyRows: 0,
		pageRows: 0,
		salts: 0,
	});
	expect([await daily(), await pageDaily(), await rawDates()]).toEqual(before);
});

test("a day rolled up twice adds to its counts", async () => {
	await insertEvents([{ visitor: "a" }]);
	await rollupAnalytics(NOW);
	await insertEvents([{ visitor: "b" }]);
	await rollupAnalytics(NOW);

	expect(await daily()).toContain(`${orgId} ${YESTERDAY} total: 2/2`);
	expect(await pageDaily()).toEqual([`${orgId} ${YESTERDAY} booking 2/2`]);
});

test("a failed rollup keeps the raw events", async () => {
	await insertEvents([{ visitor: "a" }, { visitor: "b" }]);
	await db.execute(
		sql`ALTER TABLE analytics_page_daily ADD CONSTRAINT rollup_test_fail CHECK (views < 0) NOT VALID`,
	);
	try {
		await expect(rollupAnalytics(NOW)).rejects.toThrow();
	} finally {
		await db.execute(
			sql`ALTER TABLE analytics_page_daily DROP CONSTRAINT rollup_test_fail`,
		);
	}

	expect(await rawDates()).toHaveLength(2);
	expect(await daily()).toEqual([]);
});

test("salts more than two days old are deleted", async () => {
	await db
		.insert(analyticsSalt)
		.values(
			[
				"2026-03-07",
				"2026-03-08",
				"2026-03-09",
				"2026-03-10",
				"2026-03-11",
			].map((localDate) => ({ localDate, salt: localDate })),
		);

	expect((await rollupAnalytics(NOW)).salts).toBe(1);

	const left = await db
		.select({ localDate: analyticsSalt.localDate })
		.from(analyticsSalt)
		.orderBy(asc(analyticsSalt.localDate));
	expect(left.map((row) => row.localDate)).toEqual([
		"2026-03-08",
		"2026-03-09",
		"2026-03-10",
		"2026-03-11",
	]);
});

test("deleting a page deletes its daily rows but keeps the site totals", async () => {
	const aboutId = await insertPage(orgId, "about");
	await insertEvents([{ visitor: "a", pageId: aboutId }, { visitor: "b" }]);
	await rollupAnalytics(NOW);

	await db.delete(page).where(eq(page.id, aboutId));

	expect(await pageDaily()).toEqual([`${orgId} ${YESTERDAY} booking 1/1`]);
	expect(await daily()).toContain(`${orgId} ${YESTERDAY} total: 2/2`);
});
