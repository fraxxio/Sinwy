import { createFileRoute } from "@tanstack/react-router";
import { Settings2Icon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/settings/")({
	component: SettingsPage,
});

function SettingsPage() {
	return (
		<>
			<PageHeader
				title="Settings"
				description="Your organization's profile and general configuration."
			/>
			<EmptyState
				icon={<Settings2Icon />}
				title="Nothing to configure yet"
				description="General organization settings will live here."
			/>
		</>
	);
}
