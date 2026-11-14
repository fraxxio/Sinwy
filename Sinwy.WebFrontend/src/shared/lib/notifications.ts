import {
	type NotificationDto,
	type NotificationPageDto,
	type NotificationUnreadCountDto,
	ORG_ROLE_LABELS,
} from "@sinwy/shared";
import {
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
} from "@tanstack/react-query";
import { api } from "#/shared/lib/api";
import { formatShortDateIn, formatTimeIn } from "#/shared/lib/date";

/** An organization's inbox, or the personal one when null. */
export type NotificationScope = { organizationId: string } | null;

const POLL_MS = 60_000;

const scopeKey = (scope: NotificationScope) =>
	scope ? scope.organizationId : "personal";

const notificationKeys = {
	scope: (scope: NotificationScope) =>
		["notifications", scopeKey(scope)] as const,
	unread: (scope: NotificationScope) =>
		[...notificationKeys.scope(scope), "unread"] as const,
	list: (scope: NotificationScope) =>
		[...notificationKeys.scope(scope), "list"] as const,
};

const basePath = (scope: NotificationScope) =>
	scope
		? `/organizations/${scope.organizationId}/notifications`
		: "/account/notifications";

const unwrap = async <T>(request: ReturnType<typeof api<T>>) => {
	const res = await request;
	if (!res.isSuccess) throw new Error(res.message);
	return res.data;
};

export const unreadCountQuery = (scope: NotificationScope) =>
	queryOptions({
		queryKey: notificationKeys.unread(scope),
		queryFn: () =>
			unwrap(
				api<NotificationUnreadCountDto>(`${basePath(scope)}/unread-count`),
			),
		select: (data) => data.count,
		refetchInterval: POLL_MS,
		refetchOnWindowFocus: true,
	});

export const notificationsQuery = (scope: NotificationScope) =>
	infiniteQueryOptions({
		queryKey: notificationKeys.list(scope),
		queryFn: ({ pageParam }) => {
			const query = pageParam ? `?before=${encodeURIComponent(pageParam)}` : "";
			return unwrap(api<NotificationPageDto>(`${basePath(scope)}${query}`));
		},
		initialPageParam: null as string | null,
		getNextPageParam: (page) => page.nextCursor,
		refetchInterval: POLL_MS,
		refetchOnWindowFocus: true,
	});

const refresh = (queryClient: QueryClient, scope: NotificationScope) =>
	queryClient.invalidateQueries({ queryKey: notificationKeys.scope(scope) });

export const markNotificationRead = async (
	queryClient: QueryClient,
	scope: NotificationScope,
	id: string,
) => {
	await api(`/notifications/${encodeURIComponent(id)}/read`, {
		method: "POST",
	});
	await refresh(queryClient, scope);
};

export const markAllNotificationsRead = async (
	queryClient: QueryClient,
	scope: NotificationScope,
) => {
	const res = await api(`${basePath(scope)}/read-all`, { method: "POST" });
	await refresh(queryClient, scope);
	if (!res.isSuccess) throw new Error(res.message);
};

/** "9+" past nine; null when there's nothing unread. */
export const unreadLabel = (count: number | undefined) =>
	!count ? null : count > 9 ? "9+" : String(count);

const bookingTime = ({
	serviceName,
	startsAt,
	timezone,
}: {
	serviceName: string;
	startsAt: string;
	timezone: string;
}) =>
	`${serviceName}, ${formatShortDateIn(startsAt, timezone)} ${formatTimeIn(startsAt, timezone)}`;

/** The headline and the line under it. */
export const notificationText = (
	notification: NotificationDto,
): { title: string; detail: string } => {
	switch (notification.type) {
		case "booking.new":
			return {
				title: `New booking: ${bookingTime(notification.payload)}`,
				detail: notification.payload.customerName,
			};
		case "booking.requested":
			return {
				title: `New booking request: ${bookingTime(notification.payload)}`,
				detail: notification.payload.customerName,
			};
		case "booking.cancelled_by_customer":
			return {
				title: `Cancelled by customer: ${bookingTime(notification.payload)}`,
				detail: notification.payload.customerName,
			};
		case "payment.recorded":
			return {
				title: `Payment recorded: ${notification.payload.amount} for ${notification.payload.serviceName}`,
				detail: `Marked paid by ${notification.payload.recordedByName}`,
			};
		case "booking.confirmed":
			return {
				title: `Booking confirmed: ${bookingTime(notification.payload)}`,
				detail: notification.payload.organizationName,
			};
		case "booking.declined":
			return {
				title: `Booking request declined: ${bookingTime(notification.payload)}`,
				detail: notification.payload.organizationName,
			};
		case "booking.cancelled":
			return {
				title: `Booking cancelled: ${bookingTime(notification.payload)}`,
				detail: notification.payload.organizationName,
			};
		case "booking.moved":
			return {
				title: `Booking moved: ${bookingTime(notification.payload)}`,
				detail: notification.payload.organizationName,
			};
		case "invitation.received":
			return {
				title: `Invitation to join ${notification.payload.organizationName}`,
				detail: `${notification.payload.inviterName} invited you as ${ORG_ROLE_LABELS[notification.payload.role]}`,
			};
		case "transfer.offered":
			return {
				title: `Ownership offer: ${notification.payload.organizationName}`,
				detail: `${notification.payload.fromName} offered you ownership`,
			};
	}
};
