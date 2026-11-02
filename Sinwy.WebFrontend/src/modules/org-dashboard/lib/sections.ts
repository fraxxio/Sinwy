import type { Permission } from "@sinwy/shared";
import type { LinkOptions } from "@tanstack/react-router";

type OrgSection = {
	to: NonNullable<LinkOptions["to"]>;
	permission: Permission;
};

/** Gated dashboard sections: the sidebar and the route guards both read this. */
export const ORG_SECTIONS = {
	bookings: {
		to: "/dashboard/$organizationSlug/bookings",
		permission: "bookings:read",
	},
	services: {
		to: "/dashboard/$organizationSlug/services",
		permission: "services:read",
	},
	customers: {
		to: "/dashboard/$organizationSlug/customers",
		permission: "customers:read",
	},
	pages: { to: "/dashboard/$organizationSlug/pages", permission: "pages:read" },
	payments: {
		to: "/dashboard/$organizationSlug/payments",
		permission: "payments:read",
	},
	analytics: {
		to: "/dashboard/$organizationSlug/analytics",
		permission: "analytics:read",
	},
	team: {
		to: "/dashboard/$organizationSlug/team",
		permission: "people:manage",
	},
	settings: {
		to: "/dashboard/$organizationSlug/settings",
		permission: "settings:manage",
	},
} as const satisfies Record<string, OrgSection>;
