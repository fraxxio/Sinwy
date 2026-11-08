import db from "@db";
import { analyticsEvent, analyticsSalt } from "@db/schema/analyticsSchema";
import { eq } from "drizzle-orm";

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
