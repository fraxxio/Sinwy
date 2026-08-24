import db from "@db";
import {
	member,
	organization,
	organizationProfile,
} from "@db/schema/organizationSchema";
import type { OrganizationStatus } from "@sinwy/shared";
import { and, eq, isNull, sql } from "drizzle-orm";

export const isSlugTaken = async (slug: string) => {
	const [row] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slug));
	return row !== undefined;
};

export const findStatusForMember = async (
	userId: string,
	organizationId: string,
) => {
	const [row] = await db
		.select({ status: organization.status })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
		);
	return row?.status ?? null;
};

/** False when no row matched, i.e. the id belongs to no organization. */
export const setStatus = async (
	organizationId: string,
	status: OrganizationStatus,
) => {
	const updated = await db
		.update(organization)
		.set({ status })
		.where(eq(organization.id, organizationId))
		.returning({ id: organization.id });
	return updated.length > 0;
};

export const findMembership = async (
	userId: string,
	organizationId: string,
) => {
	const [row] = await db
		.select({ role: member.role, status: organization.status })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
		);
	return row ?? null;
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
