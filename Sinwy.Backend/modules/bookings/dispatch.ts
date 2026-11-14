import { type EmailTemplate, emailClient } from "@backend/infrastructure/email";
import { formatLocalTime } from "@backend/lib/localDate";
import appConfig from "@config";
import { createLogger } from "@logger";
import { notifyOrganization, notifyUser } from "@notificationsModule";
import { listNotificationRecipients } from "@organizationsModule";
import {
	ORGANIZATION_NOTIFICATION_EVENTS,
	type OrganizationNotificationContent,
	type PersonalNotificationContent,
} from "@sinwy/shared";
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
type OrganizationType = Extract<
	OrganizationNotificationContent["type"],
	`booking.${string}`
>;
type PersonalType = Extract<
	PersonalNotificationContent["type"],
	`booking.${string}`
>;
/** Each side's email, and the in-app notification it comes with, if any. */
type Notices = {
	customer?: { template: Template; notification?: PersonalType };
	organization?: { template: Template; notification: OrganizationType };
};

const confirmed = {
	template: BookingConfirmedEmail,
	notification: "booking.confirmed",
} as const;
const cancelledByCustomer = {
	template: BookingCancelledByCustomerEmail,
	notification: "booking.cancelled_by_customer",
} as const;

/** The notice matrix: who hears about each event, by email and in the app. */
const noticesFor = (
	event: BookingEventRow,
	context: BookingEmailContext,
): Notices => {
	switch (event.type) {
		case "created":
			if (event.actorType !== "customer") return { customer: confirmed };
			return event.toStatus === "pending"
				? {
						customer: { template: BookingRequestReceivedEmail },
						organization: {
							template: NewBookingRequestEmail,
							notification: "booking.requested",
						},
					}
				: {
						customer: confirmed,
						organization: {
							template: NewBookingEmail,
							notification: "booking.new",
						},
					};
		case "status_changed":
			if (event.toStatus === "confirmed") return { customer: confirmed };
			if (event.toStatus !== "cancelled") return {};
			if (context.booking.cancelledBy === "customer")
				return event.payload["accountDeleted"]
					? { organization: cancelledByCustomer }
					: {
							customer: { template: CancellationConfirmedEmail },
							organization: cancelledByCustomer,
						};
			return event.fromStatus === "pending" && event.actorType === "member"
				? {
						customer: {
							template: BookingRequestDeclinedEmail,
							notification: "booking.declined",
						},
					}
				: {
						customer: {
							template: BookingCancelledEmail,
							notification: "booking.cancelled",
						},
					};
		case "rescheduled":
			return {
				customer: {
					template: BookingMovedEmail,
					notification: "booking.moved",
				},
			};
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

/** Sends the event's emails and writes its notifications from an already loaded context, so callers that delete the booking can load it first. */
export const sendBookingEmails = async (
	event: BookingEventRow,
	context: BookingEmailContext,
) => {
	const notices = noticesFor(event, context);
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

	const time = {
		serviceName: context.serviceName,
		startsAt: booking.startsAt.toISOString(),
		timezone,
	};

	if (notices.customer) {
		const { template, notification } = notices.customer;
		// manual bookings have no account to open the booking in, and a
		// system cancel closes the organization, which takes the booking with it
		const bookingPath =
			booking.customerUserId && event.actorType !== "system"
				? `/account/bookings/${booking.id}`
				: null;
		if (booking.customerEmail)
			await send(booking.customerEmail, template, {
				...props,
				bookingUrl: bookingPath && url(bookingPath),
			});
		if (notification && booking.customerUserId)
			await notifyUser(
				booking.customerUserId,
				{
					type: notification,
					payload: { ...time, organizationName: organization.name },
				},
				bookingPath,
			);
	}
	if (notices.organization) {
		const { template, notification } = notices.organization;
		const bookingPath = `/dashboard/${organization.slug}/bookings/${booking.id}`;
		const recipients = await listNotificationRecipients(
			booking.organizationId,
			ORGANIZATION_NOTIFICATION_EVENTS[notification],
		);
		await Promise.all(
			recipients.map((to) =>
				send(to, template, { ...props, bookingUrl: url(bookingPath) }),
			),
		);
		await notifyOrganization(
			booking.organizationId,
			{
				type: notification,
				payload: { ...time, customerName: booking.customerName },
			},
			bookingPath,
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
