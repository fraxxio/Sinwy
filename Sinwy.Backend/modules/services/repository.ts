import db from "@db";
import {
	availabilityException,
	service,
	serviceAvailability,
} from "@db/schema/serviceSchema";
import { setOrganizationTimezone } from "@organizationsModule";
import { and, asc, eq, gte, isNull } from "drizzle-orm";

export type ServiceRow = typeof service.$inferSelect;
type ServiceUpdate = {
	[K in Exclude<keyof ServiceRow, "id" | "organizationId">]?:
		| ServiceRow[K]
		| undefined;
};

const visibleIn = (organizationId: string) =>
	and(eq(service.organizationId, organizationId), isNull(service.archivedAt));

const byId = (organizationId: string, serviceId: string) =>
	and(visibleIn(organizationId), eq(service.id, serviceId));

export const findServices = (organizationId: string) =>
	db
		.select()
		.from(service)
		.where(visibleIn(organizationId))
		.orderBy(asc(service.name), asc(service.createdAt));

export const findService = async (
	organizationId: string,
	serviceId: string,
) => {
	const [row] = await db
		.select()
		.from(service)
		.where(byId(organizationId, serviceId));
	return row ?? null;
};

export const isServiceSlugTaken = async (
	organizationId: string,
	slug: string,
) => {
	const [row] = await db
		.select({ id: service.id })
		.from(service)
		.where(and(visibleIn(organizationId), eq(service.slug, slug)))
		.limit(1);
	return Boolean(row);
};

export const insertService = async (values: typeof service.$inferInsert) => {
	const [row] = await db.insert(service).values(values).returning();
	if (!row) throw new Error("Service insert returned no row");
	return row;
};

export const updateService = async (
	organizationId: string,
	serviceId: string,
	values: ServiceUpdate,
) => {
	const [row] = await db
		.update(service)
		.set({ ...values, updatedAt: new Date() })
		.where(byId(organizationId, serviceId))
		.returning();
	return row ?? null;
};

const orgWide = (organizationId: string) =>
	and(
		eq(serviceAvailability.organizationId, organizationId),
		isNull(serviceAvailability.serviceId),
	);

const orgClosures = (organizationId: string) =>
	and(
		eq(availabilityException.organizationId, organizationId),
		isNull(availabilityException.serviceId),
		eq(availabilityException.kind, "closed"),
		isNull(availabilityException.startTime),
	);

export type WeeklyRange = {
	weekday: number;
	startTime: string;
	endTime: string;
};

export const findOrganizationHours = (organizationId: string) =>
	db
		.select({
			weekday: serviceAvailability.weekday,
			startTime: serviceAvailability.startTime,
			endTime: serviceAvailability.endTime,
		})
		.from(serviceAvailability)
		.where(orgWide(organizationId))
		.orderBy(
			asc(serviceAvailability.weekday),
			asc(serviceAvailability.startTime),
		);

/** Replaces the org-wide rows and sets the timezone together, so hours are never read in the wrong zone. */
export const saveOrganizationHours = (
	organizationId: string,
	timezone: string,
	ranges: WeeklyRange[],
) =>
	db.transaction(async (tx) => {
		await tx.delete(serviceAvailability).where(orgWide(organizationId));
		if (ranges.length > 0)
			await tx.insert(serviceAvailability).values(
				ranges.map((range) => ({
					...range,
					id: crypto.randomUUID(),
					organizationId,
				})),
			);
		await setOrganizationTimezone(organizationId, timezone, tx);
	});

const closureColumns = {
	id: availabilityException.id,
	date: availabilityException.date,
	note: availabilityException.note,
};

export const findClosuresFrom = (organizationId: string, fromDate: string) =>
	db
		.select(closureColumns)
		.from(availabilityException)
		.where(
			and(
				orgClosures(organizationId),
				gte(availabilityException.date, fromDate),
			),
		)
		.orderBy(asc(availabilityException.date));

/** A date that's already closed keeps its row and note. */
export const insertClosure = async (
	organizationId: string,
	date: string,
	note: string | null,
) => {
	await db
		.insert(availabilityException)
		.values({
			id: crypto.randomUUID(),
			organizationId,
			date,
			kind: "closed",
			note,
		})
		.onConflictDoNothing();
	const [row] = await db
		.select(closureColumns)
		.from(availabilityException)
		.where(
			and(orgClosures(organizationId), eq(availabilityException.date, date)),
		);
	if (!row) throw new Error("Closure insert left no row");
	return row;
};

export const deleteClosure = async (
	organizationId: string,
	closureId: string,
) => {
	const [row] = await db
		.delete(availabilityException)
		.where(
			and(orgClosures(organizationId), eq(availabilityException.id, closureId)),
		)
		.returning({ id: availabilityException.id });
	return Boolean(row);
};
