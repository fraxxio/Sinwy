import db from "@db";
import { service } from "@db/schema/serviceSchema";
import { and, asc, eq, isNull } from "drizzle-orm";

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
