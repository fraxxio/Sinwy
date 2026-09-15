import type { Permission } from "@sinwy/shared";
import type { LinkOptions } from "@tanstack/react-router";

type OrgSection = {
	to: NonNullable<LinkOptions["to"]>;
	permission: Permission;
};

/** Gated dashboard sections: the sidebar and the route guards both read this. */
export const ORG_SECTIONS = {
	bookings: { to: "/$organizationSlug/bookings", permission: "bookings:read" },
	services: { to: "/$organizationSlug/services", permission: "services:read" },
	customers: {
		to: "/$organizationSlug/customers",
		permission: "customers:read",
	},
	pages: { to: "/$organizationSlug/pages", permission: "pages:read" },
	payments: { to: "/$organizationSlug/payments", permission: "payments:read" },
	analytics: {
		to: "/$organizationSlug/analytics",
		permission: "analytics:read",
	},
	team: { to: "/$organizationSlug/team", permission: "people:manage" },
	settings: {
		to: "/$organizationSlug/settings",
		permission: "settings:manage",
	},
	billing: {
		to: "/$organizationSlug/settings/billing",
		permission: "billing:manage",
	},
} as const satisfies Record<string, OrgSection>;
