import {
	type ActivityAction,
	type ActivityDetailsMap,
	type ActivityEvent,
	ORG_ROLE_LABELS,
	type OrganizationActivityPageDto,
	type OrganizationBrandingDto,
	type OrganizationProfileDto,
} from "@sinwy/shared";
import { infiniteQueryOptions } from "@tanstack/react-query";
import { api } from "#/shared/lib/api";
import { formatMinorUnits } from "#/shared/lib/money";

export const activityKeys = {
	list: (organizationId: string) => ["activity", organizationId] as const,
};

export const activityQuery = (organizationId: string) =>
	infiniteQueryOptions({
		queryKey: activityKeys.list(organizationId),
		queryFn: async ({ pageParam }) => {
			const query = pageParam ? `?before=${encodeURIComponent(pageParam)}` : "";
			const res = await api<OrganizationActivityPageDto>(
				`/organizations/${organizationId}/activity${query}`,
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		initialPageParam: null as string | null,
		getNextPageParam: (page) => page.nextCursor,
	});

const quoted = (text: string) => `“${text}”`;

const zone = (timezone: string) => timezone.replaceAll("_", " ");

const PROFILE_FIELD_LABELS: Record<keyof OrganizationProfileDto, string> = {
	tagline: "tagline",
	description: "description",
	email: "contact email",
	phone: "phone",
	website: "website",
	city: "city",
	country: "country",
};

const BRANDING_FIELD_LABELS: Record<keyof OrganizationBrandingDto, string> = {
	color: "color",
	font: "font",
};

/** What the actor did, written to follow their name. */
const SENTENCES: {
	[A in ActivityAction]: (details: ActivityDetailsMap[A]) => string;
} = {
	"member.invited": ({ role }) =>
		`invited someone to join as ${ORG_ROLE_LABELS[role]}`,
	"invitation.revoked": ({ role }) =>
		`revoked an invitation to join as ${ORG_ROLE_LABELS[role]}`,
	"member.joined": ({ role }) => `joined as ${ORG_ROLE_LABELS[role]}`,
	"member.left": () => "left the organization",
	"member.removed": ({ memberName }) => `removed ${memberName} from the team`,
	"member.role_changed": ({ memberName, role }) =>
		`changed ${memberName}'s role to ${ORG_ROLE_LABELS[role]}`,
	"page.published": ({ title }) => `published the page ${quoted(title)}`,
	"page.unpublished": ({ title }) => `unpublished the page ${quoted(title)}`,
	"page.deleted": ({ title }) => `deleted the page ${quoted(title)}`,
	"service.created": ({ name }) => `created the service ${quoted(name)}`,
	"service.price_changed": ({ name, fromMinor, toMinor, currency }) =>
		`changed the price of ${quoted(name)} from ${formatMinorUnits(fromMinor, currency)} to ${formatMinorUnits(toMinor, currency)}`,
	"service.archived": ({ name }) => `archived the service ${quoted(name)}`,
	"transfer.offered": ({ recipientName }) =>
		`offered ownership to ${recipientName}`,
	"transfer.cancelled": () => "cancelled the ownership transfer",
	"transfer.completed": ({ fromName, toName }) =>
		`completed the ownership transfer from ${fromName} to ${toName}`,
	"organization.activated": () => "activated the organization",
	"organization.deactivated": () => "deactivated the organization",
	"organization.renamed": ({ fromName, toName }) =>
		`renamed the organization from ${quoted(fromName)} to ${quoted(toName)}`,
	"organization.logo_changed": () => "changed the logo",
	"organization.logo_removed": () => "removed the logo",
	"organization.profile_updated": ({ fields }) =>
		`updated the business profile (${fields.map((field) => PROFILE_FIELD_LABELS[field]).join(", ")})`,
	"organization.timezone_changed": ({ fromTimezone, toTimezone }) =>
		`changed the timezone from ${zone(fromTimezone)} to ${zone(toTimezone)}`,
	"organization.branding_changed": ({ fields }) =>
		`changed the brand ${fields.map((field) => BRANDING_FIELD_LABELS[field]).join(" and ")}`,
};

/** A generic sentence for an action newer than this page. */
export const activitySentence = (event: ActivityEvent) => {
	const sentence = SENTENCES[event.action] as
		| ((details: ActivityEvent["details"]) => string)
		| undefined;
	return sentence ? sentence(event.details) : "made a change";
};

/** Sinwy's own actions have no actor. */
export const SYSTEM_ACTOR_NAME = "Sinwy";
