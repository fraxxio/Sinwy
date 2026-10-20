import db from "@db";
import { memberHasRole } from "@db/memberRole";
import {
	member,
	organization,
	organizationProfile,
} from "@db/schema/organizationSchema";
import type { OrganizationStatus } from "@sinwy/shared";
import {
	and,
	eq,
	exists,
	inArray,
	isNull,
	lt,
	ne,
	notExists,
	or,
	sql,
} from "drizzle-orm";

export const isSlugTaken = async (slug: string) => {
	const [row] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slug));
	return row !== undefined;
};

/** Applies the status only if `changedAt` is newer than the last applied change. */
export const setStatus = async (
	organizationId: string,
	status: OrganizationStatus,
	changedAt: Date,
): Promise<"applied" | "outdated" | "unknown"> => {
	const updated = await db
		.update(organization)
		.set({ status, subscriptionStatusAt: changedAt })
		.where(
			and(
				eq(organization.id, organizationId),
				or(
					isNull(organization.subscriptionStatusAt),
					lt(organization.subscriptionStatusAt, changedAt),
				),
			),
		)
		.returning({ id: organization.id });
	if (updated.length > 0) return "applied";

	const [row] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.id, organizationId));
	return row ? "outdated" : "unknown";
};

export const findOnboardingCompletedAt = async (organizationId: string) => {
	const [row] = await db
		.select({ completedAt: organization.onboardingCompletedAt })
		.from(organization)
		.where(eq(organization.id, organizationId));
	return row?.completedAt ?? null;
};

export const findProfile = async (organizationId: string) => {
	const [row] = await db
		.select()
		.from(organizationProfile)
		.where(eq(organizationProfile.organizationId, organizationId));
	return row ?? null;
};

export const upsertProfile = async (
	organizationId: string,
	values: Omit<
		typeof organizationProfile.$inferInsert,
		"organizationId" | "updatedAt"
	>,
) => {
	const [row] = await db
		.insert(organizationProfile)
		.values({ ...values, organizationId })
		.onConflictDoUpdate({
			target: organizationProfile.organizationId,
			set: { ...values, updatedAt: sql`now()` },
		})
		.returning();
	return row;
};

/** Idempotent: an organization keeps the timestamp of its first completion. */
export const markOnboardingCompleted = async (organizationId: string) => {
	const [row] = await db
		.update(organization)
		.set({ onboardingCompletedAt: new Date() })
		.where(
			and(
				eq(organization.id, organizationId),
				isNull(organization.onboardingCompletedAt),
			),
		)
		.returning({ completedAt: organization.onboardingCompletedAt });
	return row?.completedAt ?? null;
};

/** Organizations where this user is an owner and no other member is. */
export const findSoleOwnedOrganizations = (userId: string) =>
	db
		.select({
			id: organization.id,
			name: organization.name,
			status: organization.status,
		})
		.from(organization)
		.where(
			and(
				exists(
					db
						.select({ id: member.id })
						.from(member)
						.where(
							and(
								eq(member.organizationId, organization.id),
								eq(member.userId, userId),
								memberHasRole("owner"),
							),
						),
				),
				notExists(
					db
						.select({ id: member.id })
						.from(member)
						.where(
							and(
								eq(member.organizationId, organization.id),
								ne(member.userId, userId),
								memberHasRole("owner"),
							),
						),
				),
			),
		)
		.orderBy(organization.name);

/** FK cascades remove members, invitations and the profile. */
export const deleteOrganizations = (ids: string[]) =>
	db.delete(organization).where(inArray(organization.id, ids));
