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
	customerListPageSize: 20,
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
	/** Copied from the service at creation; see `customerCanCancel`. */
	cancellationWindowMinutes: number;
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
	| "cancellationWindowMinutes"
	| "createdAt"
> & {
	organization: {
		name: string;
		slug: string;
		timezone: string;
		city: string | null;
		country: string | null;
		phone: string | null;
		email: string | null;
	};
};

/** Who acted, as the customer sees it: themselves, the business, or nobody in particular. */
export type CustomerBookingEventActor = "customer" | "organization" | "system";

export type CustomerBookingEventDto = {
	id: string;
	type: Exclude<BookingEventType, "contact_updated">;
	fromStatus: BookingStatus | null;
	toStatus: BookingStatus | null;
	actor: CustomerBookingEventActor;
	/** The old and new start, on `rescheduled`. */
	moved: { from: string; to: string } | null;
	occurredAt: string;
};

export type CustomerBookingDetailDto = CustomerBookingDto & {
	history: CustomerBookingEventDto[];
};

export const CUSTOMER_BOOKING_TABS = ["upcoming", "past"] as const;
export type CustomerBookingTab = (typeof CUSTOMER_BOOKING_TABS)[number];

export type CustomerBookingListDto = {
	items: CustomerBookingDto[];
	total: number;
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

/** The dashboard overview. Dates are local "YYYY-MM-DD" in `timezone`; the week is the ISO week holding `today`. */
export type BookingOverviewDto = {
	timezone: string;
	currency: string;
	today: string;
	week: { from: string; to: string };
	/** Today's bookings in time order, without cancelled. */
	todayBookings: BookingDto[];
	/** Prices of this week's confirmed and completed bookings. */
	revenue: { bookedMinor: number; completedMinor: number };
	/** Pending requests that haven't started, oldest request first. */
	pending: { total: number; oldest: BookingDto[] };
	/** Null when the week has no open minutes. */
	occupancy: {
		bookedMinutes: number;
		openMinutes: number;
		percent: number | null;
	};
	/** Started bookings still waiting for an outcome or an answer. */
	needsAttention: { unresolved: number; expiredRequests: number };
};
