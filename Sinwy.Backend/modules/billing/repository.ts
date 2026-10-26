import db from "@db";
import {
	type HeldSlot,
	listHeldSlots,
	releaseSlotsOverLimit,
	slotLimit,
} from "@db/organizationAccess";
import { user, userSubscription } from "@db/schema/userSchema";
import type { PlanSlug } from "@sinwy/shared";
import { eq, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const findUserSubscription = async (userId: string) => {
	const [row] = await db
		.select({
			subscriptionId: userSubscription.subscriptionId,
			plan: userSubscription.plan,
			status: userSubscription.status,
			trialUsedAt: userSubscription.trialUsedAt,
			downgradePlan: userSubscription.downgradePlan,
			downgradeReleases: userSubscription.downgradeReleases,
		})
		.from(userSubscription)
		.where(eq(userSubscription.userId, userId));
	return row ?? null;
};

export const findUserContact = async (userId: string) => {
	const [row] = await db
		.select({ email: user.email, name: user.name })
		.from(user)
		.where(eq(user.id, userId));
	return row ?? null;
};

export const listOwnedHeldSlots = (userId: string) => listHeldSlots(db, userId);

/** Replaces any earlier one; Polar holds the product change itself. */
export const saveDowngrade = (
	userId: string,
	plan: PlanSlug,
	releases: string[],
) =>
	db
		.update(userSubscription)
		.set({ downgradePlan: plan, downgradeReleases: releases })
		.where(eq(userSubscription.userId, userId));

export const clearDowngrade = (userId: string) =>
	db
		.update(userSubscription)
		.set({ downgradePlan: null, downgradeReleases: [] })
		.where(eq(userSubscription.userId, userId));

type StoredDowngrade = {
	downgradePlan: string | null;
	downgradeReleases: string[];
};

export type SlotsReleased = {
	picked: HeldSlot[];
	unpicked: HeldSlot[];
	/** The plan's cap they were fitted to. */
	limit: number;
};

/**
 * Runs with the plan row locked, after the projection wrote it. A stored
 * downgrade lasts while Polar still holds it pending; when the plan lands on
 * it, its picks lose their slots. Then the held slots are fitted to the
 * plan's cap. A lapsed or paused plan keeps its slots (Default 8).
 */
const settleSlots = async (
	tx: Tx,
	userId: string,
	values: { plan: PlanSlug | null; pendingPlan: PlanSlug | null },
	stored: StoredDowngrade | null,
): Promise<SlotsReleased> => {
	let releaseFirst: string[] = [];
	if (stored?.downgradePlan && stored.downgradePlan !== values.pendingPlan) {
		if (stored.downgradePlan === values.plan)
			releaseFirst = stored.downgradeReleases;
		await tx
			.update(userSubscription)
			.set({ downgradePlan: null, downgradeReleases: [] })
			.where(eq(userSubscription.userId, userId));
	}
	const limit = slotLimit(values.plan);
	if (!values.plan) return { picked: [], unpicked: [], limit };
	return {
		...(await releaseSlotsOverLimit(tx, userId, limit, releaseFirst)),
		limit,
	};
};

export type SubscriptionWrite =
	| ({ result: "applied" } & SlotsReleased)
	| { result: "unknown-user" }
	| { result: "outdated" }
	| { result: "bound-elsewhere"; boundSubscriptionId: string };

/**
 * One subscription backs a user at a time; while bound, no other one may
 * change the row (stale revocations, a second purchase). Polar may also
 * redeliver or reorder state, so only newer state applies. `bound` keeps the
 * subscription bound (it grants access or is paused) or releases it.
 * `pendingPlan` is the product change Polar has scheduled, if any.
 */
export const writeUserSubscription = (
	userId: string,
	subscriptionId: string,
	observedAt: Date,
	values: {
		plan: PlanSlug | null;
		pendingPlan: PlanSlug | null;
		status: string;
		bound: boolean;
	},
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
		const applied = async (stored: StoredDowngrade | null) => ({
			result: "applied" as const,
			...(await settleSlots(tx, userId, values, stored)),
		});
		const inserted = await tx
			.insert(userSubscription)
			.values({
				userId,
				...next,
				trialUsedAt: values.bound ? observedAt : null,
			})
			.onConflictDoNothing()
			.returning({ userId: userSubscription.userId });
		if (inserted.length > 0) return applied(null);

		const [row] = await tx
			.select({
				subscriptionId: userSubscription.subscriptionId,
				subscriptionStatusAt: userSubscription.subscriptionStatusAt,
				downgradePlan: userSubscription.downgradePlan,
				downgradeReleases: userSubscription.downgradeReleases,
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
		return applied(row);
	});
