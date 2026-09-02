import { createFileRoute, linkOptions, Outlet } from "@tanstack/react-router";
import { AccountSidebar } from "#/modules/account-dashboard/components/AccountSidebar";
import { AppShell } from "#/shared/components/shell/AppShell";
import { protectedRoute } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute("/account/_shell")({
	...protectedRoute,
	staticData: { appShell: true },
	component: AccountShell,
});

function AccountShell() {
	return (
		<AppShell
			sidebar={<AccountSidebar />}
			rootCrumb={{
				label: "Personal account",
				link: linkOptions({ to: "/account" }),
			}}
		>
			<Outlet />
		</AppShell>
	);
}
