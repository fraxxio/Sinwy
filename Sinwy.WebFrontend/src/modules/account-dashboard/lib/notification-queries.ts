import type {
	NotificationEvent,
	OrganizationNotificationPreferencesDto,
} from "@sinwy/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "#/shared/lib/api";

export const notificationKeys = {
	preferences: ["account", "notification-preferences"],
} as const;

export const notificationPreferencesQuery = queryOptions({
	queryKey: notificationKeys.preferences,
	queryFn: async () => {
		const res = await api<OrganizationNotificationPreferencesDto[]>(
			"/account/notification-preferences",
		);
		if (!res.isSuccess) throw new Error(res.message);
		return res.data;
	},
});

export const saveNotificationPreference = async (
	organizationId: string,
	event: NotificationEvent,
	enabled: boolean,
) => {
	const res = await api<OrganizationNotificationPreferencesDto>(
		`/account/organizations/${organizationId}/notification-preferences`,
		{ method: "PUT", body: JSON.stringify({ email: { [event]: enabled } }) },
	);
	if (!res.isSuccess) throw new Error(res.message);
	return res.data;
};
