import {
	type BookingContactInput,
	bookingContactSchema,
	type ManualBookingInput,
	manualBookingSchema,
} from "@sinwy/shared";
import { z } from "zod";
import { instantOfWallTime } from "#/modules/org-dashboard/lib/calendar";
import { formatTimeIn, localDateOf } from "#/shared/lib/date";
import { fromText } from "#/shared/lib/text-schema";

/** A start from the free times, or any day and wall-clock time staff type in. */
export type BookingTimeValue = {
	custom: boolean;
	/** "YYYY-MM-DD" in the organization's zone. */
	date: string;
	/** The picked free time, an ISO instant, or "". */
	start: string;
	/** The typed "HH:mm", in the organization's zone. */
	time: string;
};

export const bookingTimeValue = (
	date: string,
	start?: { iso: string; timezone: string; custom: boolean },
): BookingTimeValue =>
	start
		? {
				custom: start.custom,
				date: localDateOf(start.iso, start.timezone),
				start: start.custom ? "" : start.iso,
				time: formatTimeIn(start.iso, start.timezone),
			}
		: { custom: false, date, start: "", time: "" };

const WALL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Turns the time field into the ISO start the API takes; a typed time is read in `timezone`, never the browser's. */
export const bookingTimeSchema = (timezone: string) =>
	z
		.object({
			custom: z.boolean(),
			date: z.string(),
			start: z.string(),
			time: z.string(),
		})
		.transform((value, ctx) => {
			if (!value.custom) {
				if (value.start) return value.start;
				ctx.addIssue({ code: "custom", message: "Pick a time" });
				return z.NEVER;
			}
			if (
				!z.iso.date().safeParse(value.date).success ||
				!WALL_TIME.test(value.time)
			) {
				ctx.addIssue({ code: "custom", message: "Enter a day and a time" });
				return z.NEVER;
			}
			return new Date(
				instantOfWallTime(value.date, value.time, timezone),
			).toISOString();
		});

const contactShape = {
	customerName: bookingContactSchema.shape.customerName,
	customerEmail: fromText(bookingContactSchema.shape.customerEmail),
	customerPhone: fromText(bookingContactSchema.shape.customerPhone),
};

// runs even while another field is wrong, so both mistakes show at once
const emailOrPhone = {
	message: "Add an email or a phone number",
	path: ["customerEmail"],
	when: () => true,
};
const hasEmailOrPhone = (contact: {
	customerEmail: unknown;
	customerPhone: unknown;
}) => Boolean(contact.customerEmail || contact.customerPhone);

export type ContactFormValues = {
	customerName: string;
	customerEmail: string;
	customerPhone: string;
};

export const contactFormValues = (
	contact: {
		customerName: string;
		customerEmail: string | null;
		customerPhone: string | null;
	} = { customerName: "", customerEmail: null, customerPhone: null },
): ContactFormValues => ({
	customerName: contact.customerName,
	customerEmail: contact.customerEmail ?? "",
	customerPhone: contact.customerPhone ?? "",
});

export const contactFormSchema = z
	.object(contactShape)
	.refine(hasEmailOrPhone, emailOrPhone)
	.transform((contact): BookingContactInput => contact);

export type ManualBookingFormValues = ContactFormValues & {
	serviceId: string;
	when: BookingTimeValue;
	internalNote: string;
};

export const manualBookingFormSchema = (timezone: string) =>
	z
		.object({
			...contactShape,
			serviceId: manualBookingSchema.shape.serviceId,
			when: bookingTimeSchema(timezone),
			internalNote: fromText(manualBookingSchema.shape.internalNote),
		})
		.refine(hasEmailOrPhone, emailOrPhone)
		.transform(
			({ when, ...rest }): ManualBookingInput => ({ ...rest, startsAt: when }),
		);
