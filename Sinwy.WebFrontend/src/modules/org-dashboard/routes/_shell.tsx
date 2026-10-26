import { AUTH_ERROR_CODES, type OrganizationSummary } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	linkOptions,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { OrganizationSidebar } from "#/modules/org-dashboard/components/OrganizationSidebar";
import { PaymentFailedBanner } from "#/modules/org-dashboard/components/PaymentFailedBanner";
import { AppShell } from "#/shared/components/shell/AppShell";
import { raiseAccessDenied } from "#/shared/lib/auth/access-denied";
import { authClient } from "#/shared/lib/auth/auth-client";
import { toEntitlements } from "#/shared/lib/auth/entitlements";
import { requireAuth, requireMember } from "#/shared/lib/auth/protected-route";
import {
	closedOrganizationReason,
	isOrganizationOpen,
	organizationsQuery,
	reactivationLink,
} from "#/shared/lib/organizations";

/** Owner → Account → Organizations, everyone else → their account with a notice. */
const leaveClosedOrganization = (
	organization: OrganizationSummary | undefined,
	preload: boolean,
) => {
	const link = organization && reactivationLink(organization);
	if (link) return redirect(link);
	if (!preload)
		raiseAccessDenied(
			organization
				? closedOrganizationReason(organization)
				: "This organization isn't available",
		);
	return redirect({ to: "/account" });
};

export const Route = createFileRoute("/$organizationSlug/_shell")({
	ssr: false,
	beforeLoad: async ({ location, params, context, preload }) => {
		const ctx = await requireAuth({ location });
		const findSummary = (organizations: OrganizationSummary[]) =>
			organizations.find((org) => org.slug === params.organizationSlug);
		const summary = await context.queryClient
			.fetchQuery(organizationsQuery)
			.then(findSummary, () => undefined);
		if (summary && !isOrganizationOpen(summary))
			throw leaveClosedOrganization(summary, preload);

		// preloads must not move the active organization; the destination's own
		// non-preload load still activates it
		const { data, error } = preload
			? await authClient.organization.getFullOrganization({
					query: { organizationSlug: params.organizationSlug, membersLimit: 1 },
				})
			: await authClient.organization.setActive({
					organizationSlug: params.organizationSlug,
				});
		// the list was stale: the backend refused to open it
		if (error?.code === AUTH_ERROR_CODES.ORGANIZATION_INACTIVE) {
			const fresh = await context.queryClient
				.fetchQuery({ ...organizationsQuery, staleTime: 0 })
				.then(findSummary, () => undefined);
			throw leaveClosedOrganization(fresh, preload);
		}
		if (error || !data) throw redirect({ to: "/" });
		const member = await requireMember(context.queryClient, data.id);
		// a list cached before joining it doesn't have it yet
		const entitled =
			summary ??
			(await context.queryClient
				.fetchQuery({ ...organizationsQuery, staleTime: 0 })
				.then(findSummary, () => undefined));
		return {
			...ctx,
			organization: data,
			member,
			entitlements: toEntitlements(entitled),
		};
	},
	staticData: { appShell: true },
	component: OrganizationShell,
});

function OrganizationShell() {
	const { organization } = Route.useRouteContext();
	const { data: organizations } = useQuery(organizationsQuery);
	const paymentFailed = organizations?.some(
		(org) => org.id === organization.id && org.paymentFailed,
	);

	return (
		<AppShell
			banner={paymentFailed && <PaymentFailedBanner />}
			sidebar={<OrganizationSidebar organizationSlug={organization.slug} />}
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
