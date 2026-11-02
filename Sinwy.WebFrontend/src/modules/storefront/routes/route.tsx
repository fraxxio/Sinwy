import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { StoreIcon } from "lucide-react";
import { storefrontQuery } from "#/modules/storefront/lib/storefront-queries";
import { EmptyState } from "#/shared/components/EmptyState";

export const Route = createFileRoute("/$organizationSlug")({
	ssr: false,
	loader: ({ params, context }) =>
		context.queryClient.ensureQueryData(
			storefrontQuery(params.organizationSlug),
		),
	component: StorefrontLayout,
});

function StorefrontLayout() {
	const { organizationSlug } = Route.useParams();
	const { data: storefront } = useSuspenseQuery(
		storefrontQuery(organizationSlug),
	);

	if (!storefront)
		return (
			<main className="page-wrap py-14">
				<EmptyState
					icon={<StoreIcon />}
					title="This booking page isn't available"
					description="The link may be wrong, or the business isn't taking bookings on Sinwy right now."
				/>
			</main>
		);

	const { organization } = storefront;
	const place = [organization.city, organization.country]
		.filter(Boolean)
		.join(", ");
	return (
		<main className="page-wrap py-10">
			<div className="mx-auto w-full max-w-2xl space-y-8">
				<header className="space-y-1">
					<h1 className="font-semibold text-3xl">{organization.name}</h1>
					{organization.tagline && (
						<p className="text-muted-foreground">{organization.tagline}</p>
					)}
					{place && <p className="text-muted-foreground text-sm">{place}</p>}
				</header>
				<Outlet />
			</div>
		</main>
	);
}
