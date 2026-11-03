import type {
	CustomerBookingDetailDto,
	CustomerBookingDto,
	CustomerBookingListDto,
	CustomerBookingTab,
} from "@sinwy/shared";
import {
	keepPreviousData,
	type QueryClient,
	queryOptions,
} from "@tanstack/react-query";
import { api } from "#/shared/lib/api";

export const accountBookingKeys = {
	all: ["account-bookings"] as const,
	list: (tab: CustomerBookingTab, page: number) =>
		[...accountBookingKeys.all, "list", { tab, page }] as const,
	detail: (bookingId: string) =>
		[...accountBookingKeys.all, "detail", bookingId] as const,
};

export const accountBookingsQuery = (tab: CustomerBookingTab, page: number) =>
	queryOptions({
		queryKey: accountBookingKeys.list(tab, page),
		queryFn: async () => {
			const res = await api<CustomerBookingListDto>(
				`/account/bookings?tab=${tab}&page=${page}`,
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		placeholderData: keepPreviousData,
	});

/** Null when the booking doesn't exist or isn't the session user's. */
export const accountBookingQuery = (bookingId: string) =>
	queryOptions({
		queryKey: accountBookingKeys.detail(bookingId),
		queryFn: async () => {
			const res = await api<CustomerBookingDetailDto>(
				`/account/bookings/${encodeURIComponent(bookingId)}`,
			);
			if (res.isSuccess) return res.data;
			if (res.code === 404) return null;
			throw new Error(res.message);
		},
	});

export const cancelAccountBooking = (bookingId: string) =>
	api<CustomerBookingDto>(
		`/account/bookings/${encodeURIComponent(bookingId)}/cancel`,
		{ method: "POST" },
	);

export const invalidateAccountBookings = (queryClient: QueryClient) =>
	queryClient.invalidateQueries({ queryKey: accountBookingKeys.all });
