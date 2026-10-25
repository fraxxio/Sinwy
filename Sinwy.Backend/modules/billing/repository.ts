import db from "@db";
import { user, userSubscription } from "@db/schema/userSchema";
import type { PlanSlug } from "@sinwy/shared";
import { eq, sql } from "drizzle-orm";

export const findUserSubscription = async (userId: string) => {
	const [row] = await db
		.select({
			subscriptionId: userSubscription.subscriptionId,
			plan: userSubscription.plan,
			status: userSubscription.status,
			trialUsedAt: userSubscription.trialUsedAt,
		})
		.from(userSubscription)
		.where(eq(userSubscription.userId, userId));
	return row ?? null;
};

export type SubscriptionWrite =
	| { result: "applied" }
	| { result: "unknown-user" }
	| { result: "outdated" }
	| { result: "bound-elsewhere"; boundSubscriptionId: string };

/**
 * One subscription backs a user at a time; while bound, no other one may
 * change the row (stale revocations, a second purchase). Polar may also
 * redeliver or reorder state, so only newer state applies. `bound` keeps the
 * subscription bound (it grants access or is paused) or releases it.
 */
export const writeUserSubscription = (
	userId: string,
	subscriptionId: string,
	observedAt: Date,
	values: { plan: PlanSlug | null; status: string; bound: boolean },
) =>
	db.transaction(async (tx): Promise<SubscriptionWrite> => {
		const [owner] = await tx
			.select({ id: user.id })
			.from(user)
			.where(eq(user.id, userId))
			.for("key share");
		if (!owner) return { result: "unknown-user" };

		const next = {
			subscriptionId: values.bound ? subscriptionId : null,
			plan: values.plan,
			status: values.status,
			subscriptionStatusAt: observedAt,
		};
		const inserted = await tx
			.insert(userSubscription)
			.values({
				userId,
				...next,
				trialUsedAt: values.bound ? observedAt : null,
			})
			.onConflictDoNothing()
			.returning({ userId: userSubscription.userId });
		if (inserted.length > 0) return { result: "applied" };

		const [row] = await tx
			.select({
				subscriptionId: userSubscription.subscriptionId,
				subscriptionStatusAt: userSubscription.subscriptionStatusAt,
			})
			.from(userSubscription)
			.where(eq(userSubscription.userId, userId))
			.for("update");
		if (!row) throw new Error("User subscription row vanished mid-write");
		if (row.subscriptionId !== null && row.subscriptionId !== subscriptionId)
			return {
				result: "bound-elsewhere",
				boundSubscriptionId: row.subscriptionId,
			};
		if (row.subscriptionStatusAt >= observedAt) return { result: "outdated" };

		await tx
			.update(userSubscription)
			.set({
				...next,
				// the first plan a user ever held used up their one trial
				...(values.bound && {
					trialUsedAt: sql`coalesce(${userSubscription.trialUsedAt}, ${observedAt.toISOString()}::timestamp)`,
				}),
			})
			.where(eq(userSubscription.userId, userId));
		return { result: "applied" };
	});
