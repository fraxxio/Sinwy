import { createFileRoute } from "@tanstack/react-router";
import { Settings2Icon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/account/_shell/settings")({
	staticData: { crumb: "Settings" },
	component: SettingsPage,
});

function SettingsPage() {
	return (
		<>
			<PageHeader
				title="Settings"
				description="Your profile, security and preferences."
			/>
			<EmptyState
				icon={<Settings2Icon />}
				title="Nothing to configure yet"
				description="Account settings will live here."
			/>
		</>
	);
}
