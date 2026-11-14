import { type EmailTemplate, emailClient } from "@backend/infrastructure/email";
import { formatLocalTime } from "@backend/lib/localDate";
import appConfig from "@config";
import { createLogger } from "@logger";
import { listNotificationRecipients } from "@organizationsModule";
import type { NotificationEvent } from "@sinwy/shared";
import {
	BookingCancelledByCustomerEmail,
	BookingCancelledEmail,
	BookingConfirmedEmail,
	type BookingEmailProps,
	BookingMovedEmail,
	BookingRequestDeclinedEmail,
	BookingRequestReceivedEmail,
	CancellationConfirmedEmail,
	NewBookingEmail,
	NewBookingRequestEmail,
} from "./emails/bookingEmails";
import {
	type BookingEmailContext,
	type BookingEventRow,
	findBookingEmailContext,
} from "./repository";

const logger = createLogger("bookings");

type Template = EmailTemplate<BookingEmailProps>;
type Emails = {
	customer?: Template;
	organization?: { template: Template; event: NotificationEvent };
};

const newBooking = (template: Template) =>
	({ template, event: "booking.new" }) as const;
const cancelledByCustomer = {
	template: BookingCancelledByCustomerEmail,
	event: "booking.cancelled_by_customer",
} as const;

/** The email matrix: who hears about each event. */
const emailsFor = (
	event: BookingEventRow,
	context: BookingEmailContext,
): Emails => {
	switch (event.type) {
		case "created":
			if (event.actorType !== "customer")
				return { customer: BookingConfirmedEmail };
			return event.toStatus === "pending"
				? {
						customer: BookingRequestReceivedEmail,
						organization: newBooking(NewBookingRequestEmail),
					}
				: {
						customer: BookingConfirmedEmail,
						organization: newBooking(NewBookingEmail),
					};
		case "status_changed":
			if (event.toStatus === "confirmed")
				return { customer: BookingConfirmedEmail };
			if (event.toStatus !== "cancelled") return {};
			if (context.booking.cancelledBy === "customer")
				return event.payload["accountDeleted"]
					? { organization: cancelledByCustomer }
					: {
							customer: CancellationConfirmedEmail,
							organization: cancelledByCustomer,
						};
			return event.fromStatus === "pending" && event.actorType === "member"
				? { customer: BookingRequestDeclinedEmail }
				: { customer: BookingCancelledEmail };
		case "rescheduled":
			return { customer: BookingMovedEmail };
		default:
			return {};
	}
};

const url = (path: string) => new URL(path, appConfig.WEB_APP_URL).toString();

const instantFrom = (value: unknown) =>
	typeof value === "string" ? new Date(value) : null;

const send = async (
	to: string,
	template: Template,
	props: BookingEmailProps,
) => {
	try {
		await emailClient.send({ to, template, props });
	} catch (error) {
		logger.warn("Booking email failed", {
			subject: template.subject(props),
			error,
		});
	}
};

/** Sends the event's emails from an already loaded context, so callers that delete the booking can load it first. */
export const sendBookingEmails = async (
	event: BookingEventRow,
	context: BookingEmailContext,
) => {
	const emails = emailsFor(event, context);
	const { booking, organization } = context;
	const { timezone } = organization;
	const { previousStartsAt } = event.payload;
	const previous = instantFrom(previousStartsAt);
	const props = {
		organizationName: organization.name,
		serviceName: context.serviceName,
		customerName: booking.customerName,
		when: formatLocalTime(booking.startsAt, timezone),
		previousWhen: previous ? formatLocalTime(previous, timezone) : null,
		reason: booking.cancellationReason,
	};

	if (emails.customer && booking.customerEmail)
		await send(booking.customerEmail, emails.customer, {
			...props,
			// manual bookings have no account to open the booking in, and a
			// system cancel closes the organization, which takes the booking with it
			bookingUrl:
				booking.customerUserId && event.actorType !== "system"
					? url(`/account/bookings/${booking.id}`)
					: null,
		});
	if (emails.organization) {
		const { template, event: notification } = emails.organization;
		const bookingUrl = url(
			`/dashboard/${organization.slug}/bookings/${booking.id}`,
		);
		const recipients = await listNotificationRecipients(
			booking.organizationId,
			notification,
		);
		await Promise.all(
			recipients.map((to) => send(to, template, { ...props, bookingUrl })),
		);
	}
};

/** Call after the event's transaction commits. A failure is logged and never reaches the caller. */
export const dispatchBookingEvent = async (event: BookingEventRow) => {
	try {
		const context = await findBookingEmailContext(event.bookingId);
		if (context) await sendBookingEmails(event, context);
	} catch (error) {
		logger.warn("Booking emails failed", {
			bookingId: event.bookingId,
			eventId: event.id,
			error,
		});
	}
};
