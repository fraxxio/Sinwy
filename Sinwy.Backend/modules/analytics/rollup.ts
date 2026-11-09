import type { Job } from "@backend/lib/jobs";
import { addDaysToDate } from "@backend/lib/localDate";
import db from "@db";
import { createLogger } from "@logger";
import { deleteSaltsBefore, rollUpCompleteDays } from "./repository";

const rollupLogger = createLogger("analytics:rollup");

/** Salts are local dates of every timezone, so two days back no org can still be using one. */
const SALT_KEEP_DAYS = 2;

export const rollupAnalytics = (now = new Date()) =>
	db.transaction(async (tx) => {
		const rolledUp = await rollUpCompleteDays(tx, now);
		const utcToday = now.toISOString().slice(0, 10);
		const salts = await deleteSaltsBefore(
			tx,
			addDaysToDate(utcToday, -SALT_KEEP_DAYS),
		);
		const result = { ...rolledUp, salts };
		if (rolledUp.events > 0 || salts > 0)
			rollupLogger.info("Rolled up analytics events", result);
		return result;
	});

export const rollupAnalyticsJob: Job<
	Awaited<ReturnType<typeof rollupAnalytics>>
> = {
	name: "rollup-analytics",
	intervalMs: 60 * 60 * 1000,
	run: () => rollupAnalytics(),
};
