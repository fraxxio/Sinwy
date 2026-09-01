import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AccountSidebar } from "#/modules/account-dashboard/components/AccountSidebar";
import { requireAuth } from "#/modules/auth/lib/protected-route";
import { AppShell } from "#/shared/components/shell/AppShell";

export const Route = createFileRoute("/account/_shell")({
	ssr: false,
	beforeLoad: requireAuth,
	staticData: { appShell: true },
	component: AccountShell,
});

function AccountShell() {
	return (
		<AppShell
			sidebar={<AccountSidebar />}
			rootCrumb={{ label: "Personal account", href: "/account" }}
		>
			<Outlet />
		</AppShell>
	);
}
