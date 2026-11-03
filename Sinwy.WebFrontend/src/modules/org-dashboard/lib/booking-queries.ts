import type {
	BookableTimesDto,
	BookingDetailDto,
	BookingDto,
	BookingListDto,
	BookingOverviewDto,
	BookingSort,
	BookingStatus,
	BookingUpdateInput,
	CancelBookingInput,
	ManualBookingInput,
	RescheduleBookingInput,
} from "@sinwy/shared";
import {
	keepPreviousData,
	type QueryClient,
	queryOptions,
} from "@tanstack/react-query";
import {
	STATUS_CHANGE_PATHS,
	type StatusChangeTarget,
} from "#/modules/org-dashboard/lib/booking-actions";
import { toQueryString } from "#/modules/org-dashboard/lib/booking-search";
import { api } from "#/shared/lib/api";

export type BookingListParams = {
	from?: string | undefined;
	to?: string | undefined;
	serviceId: string[];
	status: BookingStatus[];
	q?: string | undefined;
	sort: BookingSort;
	page: number;
	pageSize?: number | undefined;
};

export type BookingCalendarParams = {
	from: string;
	to: string;
	serviceId: string[];
	status: BookingStatus[];
};

export const bookingKeys = {
	all: (organizationId: string) => ["bookings", organizationId] as const,
	list: (organizationId: string, params: BookingListParams) =>
		[...bookingKeys.all(organizationId), "list", params] as const,
	calendar: (organizationId: string, params: BookingCalendarParams) =>
		[...bookingKeys.all(organizationId), "calendar", params] as const,
	detail: (organizationId: string, bookingId: string) =>
		[...bookingKeys.all(organizationId), "detail", bookingId] as const,
	times: (organizationId: string, params: BookingTimesParams) =>
		[...bookingKeys.all(organizationId), "times", params] as const,
	overview: (organizationId: string) =>
		[...bookingKeys.all(organizationId), "overview"] as const,
};

export type BookingTimesParams = {
	serviceId: string;
	/** One local date in the organization's zone. */
	date: string;
	excludeBookingId?: string | undefined;
};

/** Every booking query of the organization, the overview's included, is stale after a write. */
export const invalidateBookings = (
	queryClient: QueryClient,
	organizationId: string,
) =>
	queryClient.invalidateQueries({ queryKey: bookingKeys.all(organizationId) });

const bookingsPath = (organizationId: string, suffix = "") =>
	`/organizations/${organizationId}/bookings${suffix}`;

export const bookingListQuery = (
	organizationId: string,
	params: BookingListParams,
) =>
	queryOptions({
		queryKey: bookingKeys.list(organizationId, params),
		queryFn: async () => {
			const res = await api<BookingListDto>(
				bookingsPath(organizationId, toQueryString(params)),
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		placeholderData: keepPreviousData,
	});

export const bookingCalendarQuery = (
	organizationId: string,
	params: BookingCalendarParams,
) =>
	queryOptions({
		queryKey: bookingKeys.calendar(organizationId, params),
		queryFn: async () => {
			const res = await api<BookingDto[]>(
				bookingsPath(organizationId, `/calendar${toQueryString(params)}`),
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		placeholderData: keepPreviousData,
	});

export const bookingQuery = (organizationId: string, bookingId: string) =>
	queryOptions({
		queryKey: bookingKeys.detail(organizationId, bookingId),
		queryFn: async () => {
			const res = await api<BookingDetailDto>(
				bookingsPath(organizationId, `/${bookingId}`),
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
	});

export const bookingOverviewQuery = (organizationId: string) =>
	queryOptions({
		queryKey: bookingKeys.overview(organizationId),
		queryFn: async () => {
			const res = await api<BookingOverviewDto>(
				bookingsPath(organizationId, "/overview"),
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
	});

/** Free start times for one service on one day; `excludeBookingId` frees the time of the booking being moved. */
export const bookingTimesQuery = (
	organizationId: string,
	params: BookingTimesParams,
) =>
	queryOptions({
		queryKey: bookingKeys.times(organizationId, params),
		queryFn: async () => {
			const query = new URLSearchParams({
				serviceId: params.serviceId,
				from: params.date,
				to: params.date,
			});
			if (params.excludeBookingId)
				query.set("excludeBookingId", params.excludeBookingId);
			const res = await api<BookableTimesDto>(
				bookingsPath(organizationId, `/times?${query}`),
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
	});

export const createManualBooking = (
	organizationId: string,
	body: ManualBookingInput,
) =>
	api<BookingDto>(bookingsPath(organizationId), {
		method: "POST",
		body: JSON.stringify(body),
	});

export const updateBooking = (
	organizationId: string,
	bookingId: string,
	body: BookingUpdateInput,
) =>
	api<BookingDto>(bookingsPath(organizationId, `/${bookingId}`), {
		method: "PATCH",
		body: JSON.stringify(body),
	});

export const changeBookingStatus = (
	organizationId: string,
	bookingId: string,
	to: StatusChangeTarget,
	body?: CancelBookingInput,
) =>
	api<BookingDto>(
		bookingsPath(organizationId, `/${bookingId}/${STATUS_CHANGE_PATHS[to]}`),
		{ method: "POST", body: JSON.stringify(body ?? {}) },
	);

export const rescheduleBooking = (
	organizationId: string,
	bookingId: string,
	body: RescheduleBookingInput,
) =>
	api<BookingDto>(bookingsPath(organizationId, `/${bookingId}/reschedule`), {
		method: "POST",
		body: JSON.stringify(body),
	});
