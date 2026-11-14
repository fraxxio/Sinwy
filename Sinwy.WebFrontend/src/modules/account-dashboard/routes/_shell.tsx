import {
	createFileRoute,
	Link,
	linkOptions,
	Outlet,
} from "@tanstack/react-router";
import { AccountSidebar } from "#/modules/account-dashboard/components/AccountSidebar";
import { NotificationBell } from "#/shared/components/notifications/NotificationBell";
import { AppShell } from "#/shared/components/shell/AppShell";
import { Button } from "#/shared/components/ui/button";
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
			actions={
				<NotificationBell
					scope={null}
					footer={(close) => (
						<Button
							variant="ghost"
							size="sm"
							className="w-full"
							nativeButton={false}
							render={<Link to="/account/notifications" onClick={close} />}
						>
							View all
						</Button>
					)}
				/>
			}
		>
			<Outlet />
		</AppShell>
	);
}
