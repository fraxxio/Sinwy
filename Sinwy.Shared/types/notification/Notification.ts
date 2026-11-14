import type { InviteRole } from "../access/OrgRole";
import type { NotificationEvent } from "../organization/NotificationPreferences";

export const NOTIFICATION_RETENTION_DAYS = 90;

export const NOTIFICATION_PAGE_SIZE = 30;

/** `startsAt` is an ISO instant, shown on the organization's wall clock. */
type BookingTime = { serviceName: string; startsAt: string; timezone: string };

type CustomerBooking = BookingTime & { customerName: string };

type OwnBooking = BookingTime & { organizationName: string };

/** What each notification keeps for its sentence: names, amounts and times, never contact details. */
export type OrganizationNotificationPayloads = {
	"booking.new": CustomerBooking;
	"booking.requested": CustomerBooking;
	"booking.cancelled_by_customer": CustomerBooking;
	"payment.recorded": {
		serviceName: string;
		amount: string;
		recordedByName: string;
	};
};

export type PersonalNotificationPayloads = {
	"booking.confirmed": OwnBooking;
	"booking.declined": OwnBooking;
	"booking.cancelled": OwnBooking;
	"booking.moved": OwnBooking;
	"invitation.received": {
		organizationName: string;
		inviterName: string;
		role: InviteRole;
	};
	"transfer.offered": { organizationName: string; fromName: string };
};

type ContentOf<Payloads> = {
	[Type in keyof Payloads]: { type: Type; payload: Payloads[Type] };
}[keyof Payloads];

export type OrganizationNotificationContent =
	ContentOf<OrganizationNotificationPayloads>;
export type PersonalNotificationContent =
	ContentOf<PersonalNotificationPayloads>;
export type NotificationContent =
	| OrganizationNotificationContent
	| PersonalNotificationContent;
export type NotificationType = NotificationContent["type"];

/** The members who receive an organization notification are those whose role receives this event. */
export const ORGANIZATION_NOTIFICATION_EVENTS: Record<
	OrganizationNotificationContent["type"],
	NotificationEvent
> = {
	"booking.new": "booking.new",
	"booking.requested": "booking.new",
	"booking.cancelled_by_customer": "booking.cancelled_by_customer",
	"payment.recorded": "payment.recorded",
};

export type NotificationDto = NotificationContent & {
	id: string;
	/** An app path, or null when there's nothing left to open. */
	link: string | null;
	readAt: string | null;
	createdAt: string;
};

export type NotificationPageDto = {
	notifications: NotificationDto[];
	nextCursor: string | null;
};

export type NotificationUnreadCountDto = { count: number };
