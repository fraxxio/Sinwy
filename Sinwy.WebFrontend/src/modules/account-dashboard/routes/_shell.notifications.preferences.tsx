import {
	NOTIFICATION_EVENT_LABELS,
	NOTIFICATION_EVENTS,
	type NotificationEvent,
	ORG_ROLE_LABELS,
	type OrganizationNotificationPreferencesDto,
} from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";
import {
	notificationKeys,
	notificationPreferencesQuery,
	saveNotificationPreference,
} from "#/modules/account-dashboard/lib/notification-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { Switch } from "#/shared/components/ui/switch";
import { toast } from "#/shared/components/ui/toast";

export const Route = createFileRoute(
	"/account/_shell/notifications/preferences",
)({
	staticData: { crumb: "Preferences" },
	component: PreferencesPage,
});

function PreferencesPage() {
	const preferences = useQuery(notificationPreferencesQuery);

	if (preferences.isPending)
		return (
			<ContentBox>
				<Skeleton className="h-48 max-w-3xl rounded-md" />
			</ContentBox>
		);
	if (preferences.isError)
		return (
			<ContentBox>
				<FieldError>{preferences.error.message}</FieldError>
			</ContentBox>
		);
	if (preferences.data.length === 0)
		return (
			<ContentBox>
				<EmptyState
					icon={<MailIcon />}
					title="No organization emails"
					description="When you belong to an organization, choose here which of its updates are emailed to you."
					className="border-none"
				/>
			</ContentBox>
		);

	return (
		<ContentBox className="divide-y">
			{preferences.data.map((organization) => (
				<OrganizationPreferences
					key={organization.organizationId}
					preferences={organization}
				/>
			))}
		</ContentBox>
	);
}

type Toggle = { event: NotificationEvent; enabled: boolean };

function useToggle(organizationId: string) {
	const queryClient = useQueryClient();
	const setEnabled = ({ event, enabled }: Toggle) =>
		queryClient.setQueryData(notificationPreferencesQuery.queryKey, (current) =>
			current?.map((item) =>
				item.organizationId === organizationId
					? { ...item, email: { ...item.email, [event]: enabled } }
					: item,
			),
		);

	return useMutation({
		mutationFn: ({ event, enabled }: Toggle) =>
			saveNotificationPreference(organizationId, event, enabled),
		onMutate: async (toggle) => {
			await queryClient.cancelQueries({
				queryKey: notificationKeys.preferences,
			});
			setEnabled(toggle);
		},
		onError: (error, toggle) => {
			setEnabled({ ...toggle, enabled: !toggle.enabled });
			toast.add({
				type: "error",
				title: "Couldn't save the preference",
				description: error.message,
			});
		},
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: notificationKeys.preferences }),
	});
}

function OrganizationPreferences({
	preferences,
}: {
	preferences: OrganizationNotificationPreferencesDto;
}) {
	const toggle = useToggle(preferences.organizationId);
	const events = NOTIFICATION_EVENTS.filter(
		(event) => preferences.email[event] !== undefined,
	);

	return (
		<SettingsSection
			id={`organization-${preferences.organizationId}`}
			title={preferences.organizationName}
			description={`Emails you get about this organization as ${ORG_ROLE_LABELS[preferences.role].toLowerCase()}.`}
		>
			<ul className="divide-y rounded-md border">
				{events.map((event) => {
					const { label, description } = NOTIFICATION_EVENT_LABELS[event];
					const id = `${preferences.organizationId}-${event}`;
					return (
						<li
							key={event}
							className="flex items-center justify-between gap-4 px-4 py-3"
						>
							<div className="grid gap-0.5 text-sm">
								<label htmlFor={id} className="font-medium">
									{label}
								</label>
								<span className="text-muted-foreground">{description}</span>
							</div>
							<div className="flex shrink-0 items-center gap-2 text-muted-foreground text-xs">
								<span aria-hidden>Email</span>
								<Switch
									id={id}
									aria-label={`Email: ${label}`}
									checked={preferences.email[event] ?? false}
									onCheckedChange={(enabled) =>
										toggle.mutate({ event, enabled })
									}
								/>
							</div>
						</li>
					);
				})}
			</ul>
		</SettingsSection>
	);
}
