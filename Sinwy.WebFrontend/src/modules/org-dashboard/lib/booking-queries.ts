import type {
	BookingDto,
	BookingListDto,
	BookingSort,
	BookingStatus,
} from "@sinwy/shared";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
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
};

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
