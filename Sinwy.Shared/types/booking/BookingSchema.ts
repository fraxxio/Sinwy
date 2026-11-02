import { z } from "zod";
import { BOOKING_LIMITS as LIMITS } from "./Booking";

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

/** Staff-entered contact details: a name, plus an email or a phone to reach the customer. */
export const bookingContactSchema = z
	.object({
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
	})
	.refine((contact) => contact.customerEmail || contact.customerPhone, {
		message: "Add an email or a phone number",
		path: ["customerEmail"],
	});

export const internalNoteSchema = optionalText(LIMITS.note, "Note");
export const customerNoteSchema = optionalText(LIMITS.note, "Note");
export const cancellationReasonSchema = optionalText(
	LIMITS.cancellationReason,
	"Reason",
);

export type BookingContactInput = z.infer<typeof bookingContactSchema>;
