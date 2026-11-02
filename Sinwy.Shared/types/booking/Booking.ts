import type { BookingStatus } from "./BookingStatus";

export const BOOKING_CANCELLERS = ["customer", "organization"] as const;
export type BookingCanceller = (typeof BOOKING_CANCELLERS)[number];

export const BOOKING_EVENT_TYPES = [
	"created",
	"status_changed",
	"rescheduled",
	"contact_updated",
] as const;
export type BookingEventType = (typeof BOOKING_EVENT_TYPES)[number];

/** `system` covers changes nobody asked for directly, such as an organization's deletion. */
export const BOOKING_EVENT_ACTOR_TYPES = [
	"member",
	"customer",
	"system",
] as const;
export type BookingEventActorType = (typeof BOOKING_EVENT_ACTOR_TYPES)[number];

export const BOOKING_LIMITS = {
	customerName: 100,
	customerEmail: 254,
	customerPhone: 32,
	note: 1000,
	cancellationReason: 500,
	listPageSize: 25,
	listMaxPageSize: 100,
	calendarDays: 42,
	/** How far ahead customers may book, in local dates from today. */
	selfBookingDays: 60,
	/** Pending or confirmed upcoming self-bookings a customer may hold in one organization. */
	upcomingSelfBookings: 5,
} as const;

/** What staff see. Times are ISO instants; prices are in the currency's smallest unit. */
export type BookingDto = {
	id: string;
	serviceId: string;
	serviceName: string;
	customerUserId: string | null;
	customerName: string;
	customerEmail: string | null;
	customerPhone: string | null;
	startsAt: string;
	endsAt: string;
	bufferBeforeMinutes: number;
	bufferAfterMinutes: number;
	priceMinor: number;
	currency: string;
	status: BookingStatus;
	cancelledBy: BookingCanceller | null;
	cancellationReason: string | null;
	customerNote: string | null;
	internalNote: string | null;
	createdAt: string;
	updatedAt: string;
};

/** What the customer sees of their own booking: no internal note and no contact snapshot. */
export type CustomerBookingDto = Pick<
	BookingDto,
	| "id"
	| "serviceId"
	| "serviceName"
	| "startsAt"
	| "endsAt"
	| "priceMinor"
	| "currency"
	| "status"
	| "cancelledBy"
	| "cancellationReason"
	| "customerNote"
	| "createdAt"
> & {
	organization: { name: string; slug: string; timezone: string };
};

export type BookingListDto = { items: BookingDto[]; total: number };

export type BookingEventDto = {
	id: string;
	type: BookingEventType;
	fromStatus: BookingStatus | null;
	toStatus: BookingStatus | null;
	actorType: BookingEventActorType;
	actorName: string | null;
	payload: Record<string, unknown>;
	occurredAt: string;
};

export type BookingDetailDto = BookingDto & { history: BookingEventDto[] };
