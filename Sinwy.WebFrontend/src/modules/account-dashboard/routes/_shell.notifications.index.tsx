import { createFileRoute } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";

export const Route = createFileRoute("/account/_shell/notifications/")({
	component: InboxPage,
});

function InboxPage() {
	return (
		<ContentBox>
			<EmptyState
				icon={<BellIcon />}
				title="You're all caught up"
				description="Notifications will show up here when there's something new."
				className="border-none"
			/>
		</ContentBox>
	);
}
