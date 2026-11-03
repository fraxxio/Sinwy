import {
	BOOKING_SORTS,
	BOOKING_STATUSES,
	type BookingStatus,
} from "@sinwy/shared";
import { z } from "zod";
import { CALENDAR_VIEWS } from "#/modules/org-dashboard/lib/calendar";

// a single value arrives as a plain string; a hand-edited list drops its bad entries
const stringList = <T extends z.ZodType<string>>(item: T) =>
	z
		.union([z.string(), z.array(z.unknown())])
		.optional()
		.transform((value) =>
			[value ?? []].flat().flatMap((entry) => {
				const parsed = item.safeParse(entry);
				return parsed.success ? [parsed.data as z.output<T>] : [];
			}),
		)
		.catch([]);

const optionalDate = z.iso.date().optional().catch(undefined);

/** Every value falls back to its default, so a stale or hand-edited URL still opens the page. */
export const bookingsSearchSchema = z.object({
	view: z.enum(["calendar", "list"]).default("calendar").catch("calendar"),
	calendarView: z.enum(CALENDAR_VIEWS).default("month").catch("month"),
	/** The calendar's date; today in the organization's zone when absent. */
	date: optionalDate,
	showCancelled: z.boolean().default(false).catch(false),
	from: optionalDate,
	to: optionalDate,
	serviceId: stringList(z.string().min(1)),
	status: stringList(z.enum(BOOKING_STATUSES)),
	q: z.string().trim().max(254).optional().catch(undefined),
	sort: z.enum(BOOKING_SORTS).default("startsAt").catch("startsAt"),
	page: z.coerce.number().int().min(1).default(1).catch(1),
});

export type BookingsSearch = z.infer<typeof bookingsSearchSchema>;

export const listQueryOf = (search: BookingsSearch) => ({
	from: search.from,
	to: search.to,
	serviceId: search.serviceId,
	status: search.status,
	q: search.q || undefined,
	sort: search.sort,
	page: search.page,
});

/** No status means everything but cancelled, so showing cancelled asks for every status. */
export const calendarStatusesOf = (search: BookingsSearch): BookingStatus[] =>
	search.showCancelled ? [...BOOKING_STATUSES] : [];

/** Query-string pairs for a booking query; lists repeat their key. */
export function toQueryString(
	query: Record<string, string | number | string[] | undefined>,
) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === "") continue;
		for (const item of [value].flat()) params.append(key, String(item));
	}
	const text = params.toString();
	return text ? `?${text}` : "";
}

/** What a URL without params means; the router leaves these out of the URL. */
export const BOOKINGS_SEARCH_DEFAULTS = bookingsSearchSchema.parse({});
