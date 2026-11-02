import type {
	BookableTimesDto,
	CustomerBookingDto,
	SelfBookingInput,
	StorefrontDto,
} from "@sinwy/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "#/shared/lib/api";

export const storefrontKeys = {
	all: (slug: string) => ["storefront", slug] as const,
	page: (slug: string) => [...storefrontKeys.all(slug), "page"] as const,
	times: (slug: string, serviceId: string, date: string) =>
		[...storefrontKeys.all(slug), "times", serviceId, date] as const,
};

const storefrontPath = (slug: string, suffix = "") =>
	`/public/organizations/${encodeURIComponent(slug)}${suffix}`;

/** null when the organization has no booking page: unknown, or not active. */
export const storefrontQuery = (slug: string) =>
	queryOptions({
		queryKey: storefrontKeys.page(slug),
		queryFn: async () => {
			const res = await api<StorefrontDto>(storefrontPath(slug));
			if (res.isSuccess) return res.data;
			if (res.code === 404) return null;
			throw new Error(res.message);
		},
	});

export const storefrontTimesQuery = (
	slug: string,
	serviceId: string,
	date: string,
) =>
	queryOptions({
		queryKey: storefrontKeys.times(slug, serviceId, date),
		queryFn: async () => {
			const res = await api<BookableTimesDto>(
				storefrontPath(
					slug,
					`/services/${encodeURIComponent(serviceId)}/times?from=${date}&to=${date}`,
				),
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
	});

export const createSelfBooking = (slug: string, body: SelfBookingInput) =>
	api<CustomerBookingDto>(storefrontPath(slug, "/bookings"), {
		method: "POST",
		body: JSON.stringify(body),
	});
