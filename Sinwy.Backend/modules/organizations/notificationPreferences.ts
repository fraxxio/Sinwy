import {
	NOTIFICATION_EVENT_DEFAULTS,
	type NotificationEmailSettings,
	type NotificationEvent,
	type NotificationPreferencesInput,
	notificationEventsFor,
	type OrganizationNotificationPreferencesDto,
	parseMemberRoles,
	primaryRole,
} from "@sinwy/shared";
import {
	findMemberNotificationPreferences,
	findNotificationRecipientEmails,
	upsertMemberNotificationPreferences,
} from "./repository";

type PreferenceRow = Awaited<
	ReturnType<typeof findMemberNotificationPreferences>
>[number];

const toDto = (row: PreferenceRow): OrganizationNotificationPreferencesDto => {
	const roles = parseMemberRoles(row.role);
	return {
		organizationId: row.organizationId,
		organizationName: row.organizationName,
		role: primaryRole(roles),
		email: Object.fromEntries(
			notificationEventsFor(roles).map((event) => [
				event,
				row.email?.[event] ?? NOTIFICATION_EVENT_DEFAULTS[event],
			]),
		),
	};
};

/** Who is emailed about an organization event: members whose role receives it and who have it on. */
export const listNotificationRecipients = (
	organizationId: string,
	event: NotificationEvent,
	options: { exceptUserId?: string } = {},
) =>
	findNotificationRecipientEmails(organizationId, event, options.exceptUserId);

export const listNotificationPreferences = async (userId: string) =>
	(await findMemberNotificationPreferences(userId)).map(toDto);

/** Events the member's role doesn't receive are ignored. */
export const saveNotificationPreferences = async (
	userId: string,
	organizationId: string,
	input: NotificationPreferencesInput,
): Promise<OrganizationNotificationPreferencesDto | null> => {
	const [row] = await findMemberNotificationPreferences(userId, organizationId);
	if (!row) return null;

	const eligible = notificationEventsFor(parseMemberRoles(row.role));
	const email: NotificationEmailSettings = {};
	for (const event of eligible) {
		const enabled = input.email[event];
		if (enabled !== undefined) email[event] = enabled;
	}
	if (Object.keys(email).length === 0) return toDto(row);

	await upsertMemberNotificationPreferences(row.memberId, email);
	const [saved] = await findMemberNotificationPreferences(
		userId,
		organizationId,
	);
	return saved ? toDto(saved) : null;
};
