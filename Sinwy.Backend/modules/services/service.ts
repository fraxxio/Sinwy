import type { Membership } from "@authModule";
import { uniqueSlug } from "@backend/lib/slug";
import {
	type ActivityActor,
	getOrganizationLocale,
	recordActivity,
} from "@organizationsModule";
import {
	type AvailabilityDto,
	type AvailabilityInput,
	type BookableTimesDto,
	type BookableTimesQuery,
	type ClosureDto,
	type ClosureInput,
	type PublicServiceDto,
	SERVICE_LIMITS,
	type ServiceDto,
} from "@sinwy/shared";
import {
	BOOKABLE_TIME_STEP_MINUTES,
	type BusyInterval,
	bookableTimes,
} from "./bookableTimes";
import {
	deleteClosure,
	findClosedDates,
	findClosuresFrom,
	findHoursForService,
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
	requiresApproval: row.requiresApproval,
	cancellationWindowMinutes: row.cancellationWindowMinutes,
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
	actor: ActivityActor,
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
	await recordActivity(organizationId, actor, {
		action: "service.created",
		details: { name: row.name },
	});
	return { ok: true, data: toServiceDto(row) };
};

/** Renaming keeps the slug, so links to the service survive. */
export const updateService = async (
	membership: Membership,
	actor: ActivityActor,
	serviceId: string,
	input: UpdateServiceInput,
): Promise<Result<ServiceDto>> => {
	if (membership.status !== "active") return inactive;
	const { organizationId } = membership;
	const before =
		input.priceMinor === undefined
			? null
			: await findService(organizationId, serviceId);
	const row = await updateServiceRow(organizationId, serviceId, input);
	if (!row) return notFound;
	if (before && before.priceMinor !== row.priceMinor)
		await recordActivity(organizationId, actor, {
			action: "service.price_changed",
			details: {
				name: row.name,
				fromMinor: before.priceMinor,
				toMinor: row.priceMinor,
				currency: row.currency,
			},
		});
	return { ok: true, data: toServiceDto(row) };
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
		requiresApproval: source.requiresApproval,
		cancellationWindowMinutes: source.cancellationWindowMinutes,
		isActive: false,
	});
	return { ok: true, data: toServiceDto(row) };
};

/** Archived services leave every list but keep their row for bookings that point at them. */
export const archiveService = async (
	membership: Membership,
	actor: ActivityActor,
	serviceId: string,
): Promise<Result<null>> => {
	if (membership.status !== "active") return inactive;
	const row = await updateServiceRow(membership.organizationId, serviceId, {
		archivedAt: new Date(),
	});
	if (!row) return notFound;
	await recordActivity(membership.organizationId, actor, {
		action: "service.archived",
		details: { name: row.name },
	});
	return { ok: true, data: null };
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

const minutesOfClock = (time: string) => {
	const [hours = 0, minutes = 0] = time.split(":").map(Number);
	return hours * 60 + minutes;
};

/** Minutes of org-wide hours over local dates `from`..`to` (inclusive), skipping closed days; wall-clock, so a DST change doesn't count. */
export const openMinutes = async (
	organizationId: string,
	from: string,
	to: string,
) => {
	const [hours, closures] = await Promise.all([
		findOrganizationHours(organizationId),
		findClosedDates(organizationId, from, to),
	]);
	const closed = new Set(closures);
	let total = 0;
	for (let date = from; date <= to; date = nextDate(date)) {
		if (closed.has(date)) continue;
		const weekday = new Date(date).getUTCDay() || 7;
		for (const row of hours)
			if (row.weekday === weekday)
				total += minutesOfClock(row.endTime) - minutesOfClock(row.startTime);
	}
	return total;
};

const nextDate = (date: string) =>
	new Date(Date.parse(date) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const saveAvailability = async (
	membership: Membership,
	input: AvailabilityInput,
): Promise<Result<AvailabilityDto>> => {
	if (membership.status !== "active") return inactive;
	await saveOrganizationHours(
		membership.organizationId,
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

/** The services a storefront offers: active and not archived. */
export const listPublicServices = async (
	organizationId: string,
): Promise<PublicServiceDto[]> =>
	(await findServices(organizationId))
		.filter((row) => row.isActive)
		.map((row) => ({
			id: row.id,
			name: row.name,
			description: row.description,
			durationMinutes: row.durationMinutes,
			priceMinor: row.priceMinor,
			currency: row.currency,
			requiresApproval: row.requiresApproval,
			cancellationWindowMinutes: row.cancellationWindowMinutes,
		}));

export type BookableService = Pick<
	ServiceRow,
	| "id"
	| "name"
	| "durationMinutes"
	| "bufferBeforeMinutes"
	| "bufferAfterMinutes"
	| "priceMinor"
	| "currency"
	| "isActive"
	| "requiresApproval"
	| "cancellationWindowMinutes"
>;

/** The fields a booking copies from its service; null when archived or in another org. */
export const findBookableService = async (
	organizationId: string,
	serviceId: string,
): Promise<BookableService | null> => {
	const row = await findService(organizationId, serviceId);
	return (
		row && {
			id: row.id,
			name: row.name,
			durationMinutes: row.durationMinutes,
			bufferBeforeMinutes: row.bufferBeforeMinutes,
			bufferAfterMinutes: row.bufferAfterMinutes,
			priceMinor: row.priceMinor,
			currency: row.currency,
			isActive: row.isActive,
			requiresApproval: row.requiresApproval,
			cancellationWindowMinutes: row.cancellationWindowMinutes,
		}
	);
};

/** A service with hours of its own uses only those; otherwise the organization's apply. */
export const listBookableTimes = async (
	organizationId: string,
	serviceId: string,
	range: BookableTimesQuery,
	busy: BusyInterval[],
	now = new Date(),
): Promise<Result<BookableTimesDto>> => {
	const [row, locale] = await Promise.all([
		findService(organizationId, serviceId),
		getOrganizationLocale(organizationId),
	]);
	if (!row || !locale) return notFound;
	if (!row.isActive)
		return { ok: true, data: { timezone: locale.timezone, times: [] } };

	const [hours, closures] = await Promise.all([
		findHoursForService(organizationId, serviceId),
		findClosedDates(organizationId, range.from, range.to),
	]);
	const own = hours.filter((hour) => hour.serviceId !== null);
	const times = bookableTimes({
		timezone: locale.timezone,
		weekly: (own.length > 0 ? own : hours).map((hour) => ({
			weekday: hour.weekday,
			start: toClock(hour.startTime),
			end: toClock(hour.endTime),
		})),
		closures,
		busy,
		durationMinutes: row.durationMinutes,
		bufferBeforeMinutes: row.bufferBeforeMinutes,
		bufferAfterMinutes: row.bufferAfterMinutes,
		from: range.from,
		to: range.to,
		now,
		minNoticeMinutes: 0,
		stepMinutes: BOOKABLE_TIME_STEP_MINUTES,
	});
	return {
		ok: true,
		data: {
			timezone: locale.timezone,
			times: times.map((time) => time.toISOString()),
		},
	};
};
