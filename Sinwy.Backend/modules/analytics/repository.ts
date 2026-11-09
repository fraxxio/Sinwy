import db, { type Tx } from "@db";
import {
	analyticsDaily,
	analyticsEvent,
	analyticsPageDaily,
	analyticsSalt,
} from "@db/schema/analyticsSchema";
import { organization } from "@db/schema/organizationSchema";
import type { AnalyticsDailyMetric } from "@sinwy/shared";
import { and, asc, between, desc, eq, lt, sql } from "drizzle-orm";

export type AnalyticsEventInsert = typeof analyticsEvent.$inferInsert;

const findSalt = async (localDate: string) => {
	const [row] = await db
		.select({ salt: analyticsSalt.salt })
		.from(analyticsSalt)
		.where(eq(analyticsSalt.localDate, localDate));
	return row?.salt ?? null;
};

/** The date's salt; the first caller creates it, so every instance agrees. */
export const saltFor = async (localDate: string, newSalt: () => string) => {
	const existing = await findSalt(localDate);
	if (existing) return existing;
	await db
		.insert(analyticsSalt)
		.values({ localDate, salt: newSalt() })
		.onConflictDoNothing();
	const salt = await findSalt(localDate);
	if (!salt) throw new Error(`No analytics salt for ${localDate}`);
	return salt;
};

export const insertEvent = (event: AnalyticsEventInsert) =>
	db.insert(analyticsEvent).values(event);

/** Timezones of the organizations with raw events waiting. */
export const findPendingTimezones = async (tx: Tx) =>
	(
		await tx
			.selectDistinct({ timezone: organization.timezone })
			.from(analyticsEvent)
			.innerJoin(
				organization,
				eq(organization.id, analyticsEvent.organizationId),
			)
	).map((row) => row.timezone);

export type TimezoneToday = { timezone: string; today: string };

/**
 * Moves raw events of days that are over in their org's timezone into the
 * daily tables. One statement, so events are deleted exactly when counted.
 * Today per timezone comes from the caller, as the database may not know
 * every zone name the app accepts.
 */
export const rollUpCompleteDays = async (tx: Tx, todays: TimezoneToday[]) => {
	if (todays.length === 0) return { events: 0, dailyRows: 0, pageRows: 0 };
	const todayRows = sql.join(
		todays.map(
			({ timezone, today }) => sql`(${timezone}::text, ${today}::date)`,
		),
		sql`, `,
	);
	const [row] = await tx.execute(sql`
		WITH org_today (timezone, local_date) AS (VALUES ${todayRows}),
		moved AS (
			DELETE FROM analytics_event e
			USING organization o, org_today t
			WHERE o.id = e.organization_id
				AND t.timezone = o.timezone
				AND e.local_date < t.local_date
			RETURNING e.organization_id, e.local_date, e.page_id, e.kind,
				e.visitor_hash, e.referrer_host, e.device
		),
		daily AS (
			INSERT INTO analytics_daily (organization_id, local_date, metric, key, events, visitors)
			SELECT organization_id, local_date, 'total', '', count(*), count(DISTINCT visitor_hash)
				FROM moved WHERE kind = 'view'
				GROUP BY organization_id, local_date
			UNION ALL
			SELECT organization_id, local_date, 'booking_started', '', count(*), count(DISTINCT visitor_hash)
				FROM moved WHERE kind = 'booking_started'
				GROUP BY organization_id, local_date
			UNION ALL
			SELECT organization_id, local_date, 'referrer', coalesce(referrer_host, ''), count(*), count(DISTINCT visitor_hash)
				FROM moved WHERE kind = 'view'
				GROUP BY organization_id, local_date, coalesce(referrer_host, '')
			UNION ALL
			SELECT organization_id, local_date, 'device', device, count(*), count(DISTINCT visitor_hash)
				FROM moved WHERE kind = 'view'
				GROUP BY organization_id, local_date, device
			ON CONFLICT (organization_id, local_date, metric, key) DO UPDATE SET
				events = analytics_daily.events + excluded.events,
				visitors = analytics_daily.visitors + excluded.visitors
			RETURNING 1
		),
		pages AS (
			INSERT INTO analytics_page_daily (organization_id, local_date, page_id, views, visitors)
			SELECT organization_id, local_date, page_id, count(*), count(DISTINCT visitor_hash)
				FROM moved WHERE kind = 'view'
				GROUP BY organization_id, local_date, page_id
			ON CONFLICT (organization_id, local_date, page_id) DO UPDATE SET
				views = analytics_page_daily.views + excluded.views,
				visitors = analytics_page_daily.visitors + excluded.visitors
			RETURNING 1
		)
		SELECT
			(SELECT count(*) FROM moved)::int AS "events",
			(SELECT count(*) FROM daily)::int AS "dailyRows",
			(SELECT count(*) FROM pages)::int AS "pageRows"
	`);
	return {
		events: Number(row?.["events"] ?? 0),
		dailyRows: Number(row?.["dailyRows"] ?? 0),
		pageRows: Number(row?.["pageRows"] ?? 0),
	};
};

export const deleteSaltsBefore = async (tx: Tx, localDate: string) => {
	const deleted = await tx
		.delete(analyticsSalt)
		.where(lt(analyticsSalt.localDate, localDate))
		.returning({ localDate: analyticsSalt.localDate });
	return deleted.length;
};

export type DateRange = { from: string; to: string };

const dailyIn = (
	organizationId: string,
	metric: AnalyticsDailyMetric,
	{ from, to }: DateRange,
) =>
	and(
		eq(analyticsDaily.organizationId, organizationId),
		eq(analyticsDaily.metric, metric),
		between(analyticsDaily.localDate, from, to),
	);

const views = sql<number>`sum(${analyticsDaily.events})::int`;
const visitors = sql<number>`sum(${analyticsDaily.visitors})::int`;

/** Days without events have no row. */
export const findDailyTotals = (organizationId: string, range: DateRange) =>
	db
		.select({
			date: analyticsDaily.localDate,
			views: analyticsDaily.events,
			visitors: analyticsDaily.visitors,
		})
		.from(analyticsDaily)
		.where(dailyIn(organizationId, "total", range))
		.orderBy(asc(analyticsDaily.localDate));

/** Daily unique visitors summed over the range. */
export const sumDailyVisitors = async (
	organizationId: string,
	metric: "total" | "booking_started",
	range: DateRange,
) => {
	const [row] = await db
		.select({
			visitors: sql<number>`coalesce(sum(${analyticsDaily.visitors}), 0)::int`,
		})
		.from(analyticsDaily)
		.where(dailyIn(organizationId, metric, range));
	return row?.visitors ?? 0;
};

/** Views per key over the range, most viewed first; `key` is '' for direct referrers. */
export const sumDailyByKey = (
	organizationId: string,
	metric: "referrer" | "device",
	range: DateRange,
	limit?: number,
) => {
	// www.example.com and example.com are one referrer
	const key =
		metric === "referrer"
			? sql<string>`(CASE WHEN ${analyticsDaily.key} LIKE 'www.%' THEN substr(${analyticsDaily.key}, 5) ELSE ${analyticsDaily.key} END)`
			: sql<string>`${analyticsDaily.key}`;
	const query = db
		.select({ key, views, visitors })
		.from(analyticsDaily)
		.where(dailyIn(organizationId, metric, range))
		.groupBy(key)
		.orderBy(desc(views), asc(key));
	return limit === undefined ? query : query.limit(limit);
};

/** Views per page over the range, most viewed first; a null page is the booking page. */
export const sumPageViews = (
	organizationId: string,
	{ from, to }: DateRange,
) => {
	const pageViews = sql<number>`sum(${analyticsPageDaily.views})::int`;
	return db
		.select({
			pageId: analyticsPageDaily.pageId,
			views: pageViews,
			visitors: sql<number>`sum(${analyticsPageDaily.visitors})::int`,
		})
		.from(analyticsPageDaily)
		.where(
			and(
				eq(analyticsPageDaily.organizationId, organizationId),
				between(analyticsPageDaily.localDate, from, to),
			),
		)
		.groupBy(analyticsPageDaily.pageId)
		.orderBy(desc(pageViews), asc(analyticsPageDaily.pageId));
};
