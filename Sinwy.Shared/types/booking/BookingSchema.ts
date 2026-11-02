import { z } from "zod";
import { BOOKING_LIMITS as LIMITS } from "./Booking";
import { BOOKING_STATUSES } from "./BookingStatus";

const optionalText = (max: number, label: string) =>
	z
		.string()
		.trim()
		.max(max, `${label} is at most ${max} characters`)
		.nullish()
		.transform((value) => value || null);

export const customerPhoneSchema = z
	.string()
	.trim()
	.max(
		LIMITS.customerPhone,
		`Phone is at most ${LIMITS.customerPhone} characters`,
	)
	.regex(/^\+?[\d\s().-]{5,}$/, "Enter a valid phone number")
	.nullish()
	.or(z.literal("").transform(() => null))
	.transform((value) => value || null);

const contactFields = z.object({
	customerName: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(LIMITS.customerName, `Max ${LIMITS.customerName} characters`),
	customerEmail: z
		.email("Enter a valid email")
		.max(LIMITS.customerEmail)
		.nullish()
		.or(z.literal("").transform(() => null))
		.transform((value) => value || null),
	customerPhone: customerPhoneSchema,
});

const hasEmailOrPhone = (contact: {
	customerEmail?: string | null | undefined;
	customerPhone?: string | null | undefined;
}) => Boolean(contact.customerEmail || contact.customerPhone);
const emailOrPhoneMessage = {
	message: "Add an email or a phone number",
	path: ["customerEmail"],
};

/** Staff-entered contact details: a name, plus an email or a phone to reach the customer. */
export const bookingContactSchema = contactFields.refine(
	hasEmailOrPhone,
	emailOrPhoneMessage,
);

export const internalNoteSchema = optionalText(LIMITS.note, "Note");
export const customerNoteSchema = optionalText(LIMITS.note, "Note");
export const cancellationReasonSchema = optionalText(
	LIMITS.cancellationReason,
	"Reason",
);

const startsAtSchema = z.iso.datetime({
	offset: true,
	error: "Pick a start time",
});

/** A phone or walk-in booking. Any start is allowed; the end follows from the service. */
export const manualBookingSchema = contactFields
	.extend({
		serviceId: z.string().min(1, "Pick a service"),
		startsAt: startsAtSchema,
		internalNote: internalNoteSchema,
	})
	.refine(hasEmailOrPhone, emailOrPhoneMessage);

/** Staff may move a booking to any start; it keeps its length. */
export const rescheduleBookingSchema = z.object({ startsAt: startsAtSchema });

export const cancelBookingSchema = z.object({
	reason: cancellationReasonSchema,
});

const CONTACT_KEYS = [
	"customerName",
	"customerEmail",
	"customerPhone",
] as const;

/**
 * A staff edit: the internal note, the contact, or both; absent fields stay as they are.
 * The contact is sent whole, as the contact card edits it.
 */
export const bookingUpdateSchema = contactFields
	.partial()
	.extend({ internalNote: internalNoteSchema.optional() })
	.refine(
		(body) =>
			CONTACT_KEYS.every((key) => key in body) ||
			CONTACT_KEYS.every((key) => !(key in body)),
		{
			message: "Send the name, email and phone together",
			path: ["customerName"],
		},
	)
	.refine(
		(body) => !("customerName" in body) || hasEmailOrPhone(body),
		emailOrPhoneMessage,
	);

const localDate = z.iso.date("Use a date like 2026-12-24");
const DAY_MS = 24 * 60 * 60 * 1000;

export const BOOKING_SORTS = ["startsAt", "-startsAt", "-createdAt"] as const;
export type BookingSort = (typeof BOOKING_SORTS)[number];

/**
 * Dates are local to the organization and inclusive, and filter on `startsAt`.
 * Without `from` and `to` the list shows bookings from today on; without `status`, everything but cancelled.
 */
const bookingFilters = z.object({
	from: localDate.optional(),
	to: localDate.optional(),
	serviceId: z.array(z.string().min(1)).default([]),
	status: z.array(z.enum(BOOKING_STATUSES)).default([]),
	q: z
		.string()
		.trim()
		.max(LIMITS.customerEmail)
		.optional()
		.transform((value) => value || undefined),
});

const ordered = <
	T extends { from?: string | undefined; to?: string | undefined },
>(
	range: T,
) => !range.from || !range.to || range.from <= range.to;
const orderedMessage = {
	message: "The start date must not be after the end date",
	path: ["to"],
};

export const bookingListQuerySchema = bookingFilters
	.extend({
		sort: z.enum(BOOKING_SORTS).default("startsAt"),
		page: z.coerce.number().int().min(1).default(1),
		pageSize: z.coerce
			.number()
			.int()
			.min(1)
			.max(LIMITS.listMaxPageSize, `At most ${LIMITS.listMaxPageSize} per page`)
			.default(LIMITS.listPageSize),
	})
	.refine(ordered, orderedMessage);

export const bookingCalendarQuerySchema = bookingFilters
	.extend({ from: localDate, to: localDate })
	.refine(ordered, orderedMessage)
	.refine(
		(range) =>
			(Date.parse(range.to) - Date.parse(range.from)) / DAY_MS <
			LIMITS.calendarDays,
		{ message: `Pick at most ${LIMITS.calendarDays} days`, path: ["to"] },
	);

export type BookingContactInput = z.infer<typeof bookingContactSchema>;
export type ManualBookingInput = z.infer<typeof manualBookingSchema>;
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type BookingUpdateInput = z.infer<typeof bookingUpdateSchema>;
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
export type BookingCalendarQuery = z.infer<typeof bookingCalendarQuerySchema>;
