import db, { type Tx } from "@db";
import { analyticsEvent, analyticsSalt } from "@db/schema/analyticsSchema";
import { eq, lt, sql } from "drizzle-orm";

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

/**
 * Moves raw events of days that are over in their org's timezone into the
 * daily tables. One statement, so events are deleted exactly when counted.
 */
export const rollUpCompleteDays = async (tx: Tx, now: Date) => {
	const [row] = await tx.execute(sql`
		WITH moved AS (
			DELETE FROM analytics_event e
			USING organization o
			WHERE o.id = e.organization_id
				AND e.local_date < (${now.toISOString()}::timestamptz AT TIME ZONE o.timezone)::date
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
