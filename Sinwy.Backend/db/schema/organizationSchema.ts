import { oneOf } from "@db/oneOf";
import { user } from "@db/schema/userSchema";
import { ORGANIZATION_TRANSFER_STATUSES } from "@sinwy/shared";
import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const organization = pgTable(
	"organization",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		// set while the org holds one of its owner's slots; active only if their plan grants access too
		slotHeldAt: timestamp("slot_held_at"),
		industry: text("industry").notNull().default("other"),
		onboardingCompletedAt: timestamp("onboarding_completed_at"),
		deletionScheduledAt: timestamp("deletion_scheduled_at"),
		logo: text("logo"),
		createdAt: timestamp("created_at").notNull(),
		metadata: text("metadata"),
	},
	(table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const organizationProfile = pgTable("organization_profile", {
	organizationId: text("organization_id")
		.primaryKey()
		.references(() => organization.id, { onDelete: "cascade" }),
	tagline: text("tagline"),
	description: text("description"),
	email: text("email"),
	phone: text("phone"),
	website: text("website"),
	city: text("city"),
	country: text("country"),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const member = pgTable(
	"member",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").default("staff").notNull(),
		createdAt: timestamp("created_at").notNull(),
	},
	(table) => [
		index("member_organizationId_idx").on(table.organizationId),
		index("member_userId_idx").on(table.userId),
		unique("member_org_user_uq").on(table.organizationId, table.userId),
		// one owner per organization; the column can hold several roles
		uniqueIndex("member_one_owner_uidx")
			.on(table.organizationId)
			.where(sql`'owner' = ANY(string_to_array(${table.role}, ','))`),
	],
);

export const invitation = pgTable(
	"invitation",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role"),
		status: text("status").default("pending").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").notNull(),
		inviterId: text("inviter_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("invitation_organizationId_idx").on(table.organizationId),
		index("invitation_email_idx").on(table.email),
	],
);

export const organizationTransfer = pgTable(
	"organization_transfer",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		fromUserId: text("from_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		toUserId: text("to_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		status: text("status").notNull().default("pending"),
		expiresAt: timestamp("expires_at").notNull(),
		// the latest checkout opened on acceptance
		checkoutId: text("checkout_id"),
		oldSubscriptionId: text("old_subscription_id"),
		newSubscriptionId: text("new_subscription_id"),
		// the old subscription was revoked and its unused time refunded
		settledAt: timestamp("settled_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [
		index("organization_transfer_toUserId_idx").on(table.toUserId),
		uniqueIndex("organization_transfer_one_open_uidx")
			.on(table.organizationId)
			.where(sql`${table.status} IN ('pending', 'accepted')`),
		check(
			"organization_transfer_status_check",
			oneOf("status", ORGANIZATION_TRANSFER_STATUSES),
		),
	],
);

export const organizationRelations = relations(
	organization,
	({ many, one }) => ({
		members: many(member),
		invitations: many(invitation),
		profile: one(organizationProfile, {
			fields: [organization.id],
			references: [organizationProfile.organizationId],
		}),
	}),
);

export const organizationProfileRelations = relations(
	organizationProfile,
	({ one }) => ({
		organization: one(organization, {
			fields: [organizationProfile.organizationId],
			references: [organization.id],
		}),
	}),
);

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [invitation.inviterId],
		references: [user.id],
	}),
}));
