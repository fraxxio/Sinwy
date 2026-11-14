import {
	type ActivityAction,
	type ActivityDetailsMap,
	type ActivityEvent,
	ORG_ROLE_LABELS,
	type OrganizationActivityPageDto,
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
