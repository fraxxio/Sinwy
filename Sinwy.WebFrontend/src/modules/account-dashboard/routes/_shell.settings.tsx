import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { ConnectedAccountsSection } from "#/modules/account-dashboard/components/settings/ConnectedAccountsSection";
import { DangerZone } from "#/modules/account-dashboard/components/settings/DangerZone";
import { EmailSection } from "#/modules/account-dashboard/components/settings/EmailSection";
import { PasswordSection } from "#/modules/account-dashboard/components/settings/PasswordSection";
import { ProfileSection } from "#/modules/account-dashboard/components/settings/ProfileSection";
import { SessionsSection } from "#/modules/account-dashboard/components/settings/SessionsSection";
import { ContentBox } from "#/shared/components/ContentBox";
import { PageHeader } from "#/shared/components/PageHeader";
import { toast } from "#/shared/components/ui/toast";
import { authClient } from "#/shared/lib/auth/auth-client";

export const Route = createFileRoute("/account/_shell/settings")({
	staticData: { crumb: "Settings" },
	validateSearch: z.object({ email: z.literal("changed").optional() }),
	component: SettingsPage,
});

function SettingsPage() {
	const { email } = Route.useSearch();
	const { session: initial } = Route.useRouteContext();
	const navigate = useNavigate();
	// the route context is a snapshot from load; the store tracks edits made here
	const { data: live } = authClient.useSession();
	const user = live?.user ?? initial.user;
	const currentToken = (live ?? initial).session.token;

	useEffect(() => {
		if (email !== "changed") return;
		toast.add({
			type: "success",
			title: "Email updated",
			description: `You now sign in as ${initial.user.email}.`,
			timeout: 6_000,
		});
		void navigate({ to: "/account/settings", search: {}, replace: true });
	}, [email, initial.user.email, navigate]);

	return (
		<>
			<PageHeader
				title="Settings"
				description="Your profile, security and preferences."
			/>
			<ContentBox className="divide-y">
				<ProfileSection user={user} />
				<EmailSection key={user.email} user={user} />
				<PasswordSection />
				<ConnectedAccountsSection />
				<SessionsSection currentToken={currentToken} />
				<DangerZone user={user} />
			</ContentBox>
		</>
	);
}
