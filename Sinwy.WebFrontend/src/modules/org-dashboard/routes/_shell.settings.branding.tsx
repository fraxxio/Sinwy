import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BrandingSection } from "#/modules/org-dashboard/components/settings/BrandingSection";
import { generalQuery } from "#/modules/org-dashboard/lib/settings-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Badge } from "#/shared/components/ui/badge";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/settings/branding",
)({
	staticData: { crumb: "Branding" },
	component: BrandingPage,
});

function BrandingPage() {
	const { organization } = Route.useRouteContext();
	const general = useQuery(generalQuery(organization.id));

	if (general.isPending)
		return (
			<ContentBox>
				<Skeleton className="h-96 max-w-3xl rounded-md" />
			</ContentBox>
		);
	if (general.isError)
		return (
			<ContentBox>
				<FieldError>{general.error.message}</FieldError>
			</ContentBox>
		);

	return (
		<ContentBox className="divide-y">
			<BrandingSection general={general.data} />
			<SettingsSection
				id="custom-domain"
				title="Custom domain"
				description="Serve your booking page and pages from your own domain."
				action={<Badge variant="secondary">Coming soon</Badge>}
			/>
		</ContentBox>
	);
}
