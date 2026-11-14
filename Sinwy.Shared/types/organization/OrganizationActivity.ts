import type { InviteRole } from "../access/OrgRole";

export const ACTIVITY_RETENTION_DAYS = 90;

export const ACTIVITY_PAGE_SIZE = 50;

/** What each action keeps for its sentence: names and roles, never contact details or field values. */
export type ActivityDetailsMap = {
	"member.invited": { role: InviteRole };
	"invitation.revoked": { role: InviteRole };
	"member.joined": { role: InviteRole };
	"member.left": Record<string, never>;
	"member.removed": { memberName: string };
	"member.role_changed": { memberName: string; role: InviteRole };
	"page.published": { title: string };
	"page.unpublished": { title: string };
	"page.deleted": { title: string };
	"service.created": { name: string };
	"service.price_changed": {
		name: string;
		fromMinor: number;
		toMinor: number;
		currency: string;
	};
	"service.archived": { name: string };
	"transfer.offered": { recipientName: string };
	"transfer.cancelled": Record<string, never>;
	"transfer.completed": { fromName: string; toName: string };
	"organization.activated": Record<string, never>;
	"organization.deactivated": Record<string, never>;
};

export type ActivityAction = keyof ActivityDetailsMap;

export type ActivityEvent = {
	[A in ActivityAction]: { action: A; details: ActivityDetailsMap[A] };
}[ActivityAction];

export type OrganizationActivityDto = ActivityEvent & {
	id: string;
	occurredAt: string;
	/** null for actions Sinwy took itself. */
	actor: { name: string; image: string | null } | null;
};

export type OrganizationActivityPageDto = {
	entries: OrganizationActivityDto[];
	/** Pass back as `before` for the next page; null on the last one. */
	nextCursor: string | null;
};
