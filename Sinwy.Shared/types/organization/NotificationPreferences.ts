import { z } from "zod";
import type { OrgRole } from "../access/OrgRole";

/** Organization events a member can be emailed about. */
export const NOTIFICATION_EVENTS = [
	"booking.new",
	"booking.cancelled_by_customer",
	"payment.recorded",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_EVENT_DEFAULTS: Record<NotificationEvent, boolean> = {
	"booking.new": true,
	"booking.cancelled_by_customer": true,
	"payment.recorded": false,
};

/** The roles that receive each event; any one of them is enough. */
export const NOTIFICATION_EVENT_ROLES: Record<
	NotificationEvent,
	readonly OrgRole[]
> = {
	"booking.new": ["owner", "admin", "staff"],
	"booking.cancelled_by_customer": ["owner", "admin", "staff"],
	"payment.recorded": ["owner", "admin"],
};

export const NOTIFICATION_EVENT_LABELS: Record<
	NotificationEvent,
	{ label: string; description: string }
> = {
	"booking.new": {
		label: "New booking",
		description: "A customer books or sends a booking request.",
	},
	"booking.cancelled_by_customer": {
		label: "Cancelled by customer",
		description: "A customer cancels their booking.",
	},
	"payment.recorded": {
		label: "Payment recorded",
		description: "Someone else marks a payment as paid.",
	},
};

/** The events a member with these roles can receive. */
export const notificationEventsFor = (roles: readonly OrgRole[]) =>
	NOTIFICATION_EVENTS.filter((event) =>
		NOTIFICATION_EVENT_ROLES[event].some((role) => roles.includes(role)),
	);

/** Email on or off per event; events left out keep their current setting. */
export const notificationPreferencesInputSchema = z
	.object({
		email: z.partialRecord(z.enum(NOTIFICATION_EVENTS), z.boolean()),
	})
	.strict();
export type NotificationPreferencesInput = z.infer<
	typeof notificationPreferencesInputSchema
>;

export type NotificationEmailSettings = Partial<
	Record<NotificationEvent, boolean>
>;

/** One membership's preferences, holding only the events its role receives. */
export type OrganizationNotificationPreferencesDto = {
	organizationId: string;
	organizationName: string;
	role: OrgRole;
	email: NotificationEmailSettings;
};
