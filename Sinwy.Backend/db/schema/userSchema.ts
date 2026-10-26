import { oneOf } from "@db/oneOf";
import { account, session } from "@db/schema/authSchema";
import { invitation, member } from "@db/schema/organizationSchema";
import { ENTITLED_SUBSCRIPTION_STATUSES, PLAN_SLUGS } from "@sinwy/shared";
import { relations, sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => new Date())
		.notNull(),
});

/** Projection of the user's Polar subscription; written by the billing module only. */
export const userSubscription = pgTable(
	"user_subscription",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		// bound while it grants access or is paused; an ended one releases it
		subscriptionId: text("subscription_id").unique(),
		// null unless the subscription grants access
		plan: text("plan"),
		// Polar's subscription status
		status: text("status").notNull(),
		// time of the Polar state behind the projection; older state must not overwrite it
		subscriptionStatusAt: timestamp("subscription_status_at").notNull(),
		trialUsedAt: timestamp("trial_used_at"),
		// a downgrade the user scheduled in the app, while Polar holds it as pending
		downgradePlan: text("downgrade_plan"),
		// owned organizations that lose their slot when the downgrade applies
		downgradeReleases: text("downgrade_releases")
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		check("user_subscription_plan_check", oneOf("plan", PLAN_SLUGS)),
		check(
			"user_subscription_downgrade_plan_check",
			oneOf("downgrade_plan", PLAN_SLUGS),
		),
		check(
			"user_subscription_plan_only_when_entitled_check",
			sql`${table.plan} IS NULL OR ${oneOf("status", ENTITLED_SUBSCRIPTION_STATUSES)}`,
		),
	],
);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	members: many(member),
	invitations: many(invitation),
}));
