import {
	createFileRoute,
	linkOptions,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { InactiveOrganizationBanner } from "#/modules/org-dashboard/components/InactiveOrganizationBanner";
import { OrganizationSidebar } from "#/modules/org-dashboard/components/OrganizationSidebar";
import { AppShell } from "#/shared/components/shell/AppShell";
import { authClient } from "#/shared/lib/auth/auth-client";
import {
	toEntitlements,
	useEntitlements,
} from "#/shared/lib/auth/entitlements";
import { requireAuth, requireMember } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute("/$organizationSlug/_shell")({
	ssr: false,
	beforeLoad: async ({ location, params, context, preload }) => {
		const ctx = await requireAuth({ location });
		// preloads must not move the active organization; the destination's own
		// non-preload load still activates it
		const { data, error } = preload
			? await authClient.organization.getFullOrganization({
					query: { organizationSlug: params.organizationSlug, membersLimit: 1 },
				})
			: await authClient.organization.setActive({
					organizationSlug: params.organizationSlug,
				});
		if (error || !data) throw redirect({ to: "/" });
		const member = await requireMember(context.queryClient, data.id);
		return {
			...ctx,
			organization: data,
			member,
			entitlements: toEntitlements(data),
		};
	},
	staticData: { appShell: true },
	component: OrganizationShell,
});

function OrganizationShell() {
	const { organization } = Route.useRouteContext();
	const { isActive } = useEntitlements();

	return (
		<AppShell
			sidebar={<OrganizationSidebar organizationSlug={organization.slug} />}
			banner={
				!isActive && (
					<InactiveOrganizationBanner organizationId={organization.id} />
				)
			}
			rootCrumb={{
				label: organization.name,
				link: linkOptions({
					to: "/$organizationSlug",
					params: { organizationSlug: organization.slug },
				}),
			}}
		>
			<Outlet />
		</AppShell>
	);
}
