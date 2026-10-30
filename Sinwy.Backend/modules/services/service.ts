import type { Membership } from "@authModule";
import { uniqueSlug } from "@backend/lib/slug";
import { getOrganizationLocale } from "@organizationsModule";
import {
	type AvailabilityDto,
	type AvailabilityInput,
	type ClosureDto,
	type ClosureInput,
	SERVICE_LIMITS,
	type ServiceDto,
} from "@sinwy/shared";
import {
	deleteClosure,
	findClosuresFrom,
	findOrganizationHours,
	findService,
	findServices,
	insertClosure,
	insertService,
	isServiceSlugTaken,
	type ServiceRow,
	saveOrganizationHours,
	updateService as updateServiceRow,
} from "./repository";
import {
	type CreateServiceInput,
	todayIn,
	type UpdateServiceInput,
} from "./utils";

type Result<T> =
	| { ok: true; data: T }
	| { ok: false; error: "not-found" | "inactive" };

const notFound = { ok: false, error: "not-found" } as const;
const inactive = { ok: false, error: "inactive" } as const;

const toServiceDto = (row: ServiceRow): ServiceDto => ({
	id: row.id,
	name: row.name,
	slug: row.slug,
	description: row.description,
	durationMinutes: row.durationMinutes,
	priceMinor: row.priceMinor,
	currency: row.currency,
	bufferBeforeMinutes: row.bufferBeforeMinutes,
	bufferAfterMinutes: row.bufferAfterMinutes,
	isActive: row.isActive,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const serviceSlug = (organizationId: string, name: string) =>
	uniqueSlug(
		name,
		(slug) => isServiceSlugTaken(organizationId, slug),
		"service",
	);

export const listServices = async (membership: Membership) =>
	(await findServices(membership.organizationId)).map(toServiceDto);

export const getService = async (
	membership: Membership,
	serviceId: string,
): Promise<Result<ServiceDto>> => {
	const row = await findService(membership.organizationId, serviceId);
	return row ? { ok: true, data: toServiceDto(row) } : notFound;
};

export const createService = async (
	membership: Membership,
	input: CreateServiceInput,
): Promise<Result<ServiceDto>> => {
	if (membership.status !== "active") return inactive;
	const { organizationId } = membership;
	const locale = await getOrganizationLocale(organizationId);
	if (!locale) return notFound;

	const row = await insertService({
		...input,
		id: crypto.randomUUID(),
		organizationId,
		slug: await serviceSlug(organizationId, input.name),
		currency: locale.currency,
	});
	return { ok: true, data: toServiceDto(row) };
};

/** Renaming keeps the slug, so links to the service survive. */
export const updateService = async (
	membership: Membership,
	serviceId: string,
	input: UpdateServiceInput,
): Promise<Result<ServiceDto>> => {
	if (membership.status !== "active") return inactive;
	const row = await updateServiceRow(
		membership.organizationId,
		serviceId,
		input,
	);
	return row ? { ok: true, data: toServiceDto(row) } : notFound;
};

/** The copy starts inactive, so it can't be booked before it's been edited. */
export const duplicateService = async (
	membership: Membership,
	serviceId: string,
): Promise<Result<ServiceDto>> => {
	if (membership.status !== "active") return inactive;
	const { organizationId } = membership;
	const source = await findService(organizationId, serviceId);
	if (!source) return notFound;

	const suffix = " (copy)";
	const name = `${source.name.slice(0, SERVICE_LIMITS.name - suffix.length)}${suffix}`;
	const row = await insertService({
		id: crypto.randomUUID(),
		organizationId,
		name,
		slug: await serviceSlug(organizationId, name),
		description: source.description,
		durationMinutes: source.durationMinutes,
		priceMinor: source.priceMinor,
		currency: source.currency,
		capacity: source.capacity,
		bufferBeforeMinutes: source.bufferBeforeMinutes,
		bufferAfterMinutes: source.bufferAfterMinutes,
		isActive: false,
	});
	return { ok: true, data: toServiceDto(row) };
};

/** Archived services leave every list but keep their row for bookings that point at them. */
export const archiveService = async (
	membership: Membership,
	serviceId: string,
): Promise<Result<null>> => {
	if (membership.status !== "active") return inactive;
	const row = await updateServiceRow(membership.organizationId, serviceId, {
		archivedAt: new Date(),
	});
	return row ? { ok: true, data: null } : notFound;
};

// Postgres returns "HH:MM:SS"; the API speaks "HH:MM"
const toClock = (time: string) => time.slice(0, 5);

/** Org-wide hours, the timezone they're read in, and closures from today on. */
export const getAvailability = async (
	membership: Membership,
): Promise<Result<AvailabilityDto>> => {
	const { organizationId } = membership;
	const locale = await getOrganizationLocale(organizationId);
	if (!locale) return notFound;

	const [hours, closures] = await Promise.all([
		findOrganizationHours(organizationId),
		findClosuresFrom(organizationId, todayIn(locale.timezone)),
	]);
	return {
		ok: true,
		data: {
			timezone: locale.timezone,
			weekly: hours.map((row) => ({
				weekday: row.weekday,
				start: toClock(row.startTime),
				end: toClock(row.endTime),
			})),
			closures,
		},
	};
};

export const saveAvailability = async (
	membership: Membership,
	input: AvailabilityInput,
): Promise<Result<AvailabilityDto>> => {
	if (membership.status !== "active") return inactive;
	await saveOrganizationHours(
		membership.organizationId,
		input.timezone,
		input.weekly.map((range) => ({
			weekday: range.weekday,
			startTime: range.start,
			endTime: range.end,
		})),
	);
	return getAvailability(membership);
};

export const addClosure = async (
	membership: Membership,
	input: ClosureInput,
): Promise<Result<ClosureDto>> => {
	if (membership.status !== "active") return inactive;
	return {
		ok: true,
		data: await insertClosure(
			membership.organizationId,
			input.date,
			input.note,
		),
	};
};

export const removeClosure = async (
	membership: Membership,
	closureId: string,
): Promise<Result<null>> => {
	if (membership.status !== "active") return inactive;
	return (await deleteClosure(membership.organizationId, closureId))
		? { ok: true, data: null }
		: notFound;
};
