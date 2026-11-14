import { currencyForCountry, hasPermission } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { OrganizationSection } from "#/modules/org-dashboard/components/settings/OrganizationSection";
import { TimezoneSection } from "#/modules/org-dashboard/components/settings/TimezoneSection";
import { useUnwrapWrite } from "#/modules/org-dashboard/lib/service-queries";
import {
	generalQuery,
	saveProfile,
	useRefreshGeneral,
} from "#/modules/org-dashboard/lib/settings-queries";
import {
	BusinessProfileForm,
	type BusinessProfileValues,
} from "#/modules/organizations/components/BusinessProfileForm";
import { ContentBox } from "#/shared/components/ContentBox";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { toast } from "#/shared/components/ui/toast";
import { useEntitlements } from "#/shared/lib/auth/entitlements";
import { getPlanName } from "#/shared/lib/plans";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/settings/",
)({
	component: SettingsPage,
});

const currencyHint = (country: string) =>
	country
		? `Prices in ${currencyForCountry(country)}, from the country. Existing services keep their price.`
		: "Your currency follows the country.";

function SettingsPage() {
	const { organization, member } = Route.useRouteContext();
	const { plan } = useEntitlements();
	// billing:manage is the owner's alone; so is the plan
	const isOwner = hasPermission(member.roles, "billing:manage");
	const general = useQuery(generalQuery(organization.id));
	const refresh = useRefreshGeneral(organization.id);
	const unwrap = useUnwrapWrite();

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

	const save = async (values: BusinessProfileValues) => {
		try {
			unwrap(await saveProfile(organization.id, values));
			await refresh();
			toast.add({ type: "success", title: "Profile saved", timeout: 4_000 });
			return null;
		} catch (error) {
			return (error as Error).message || null;
		}
	};

	return (
		<ContentBox className="divide-y">
			<OrganizationSection key={general.data.name} general={general.data} />
			<SettingsSection
				id="profile"
				title="Business profile"
				description="How customers find and contact you."
			>
				<BusinessProfileForm
					profile={general.data.profile}
					submitLabel="Save profile"
					pendingLabel="Saving…"
					onSubmit={save}
					countryDescription={currencyHint}
				/>
			</SettingsSection>
			<TimezoneSection key={general.data.timezone} general={general.data} />
			<SettingsSection
				id="notifications"
				title="Notifications"
				description="Each member chooses which of this organization's updates are emailed to them, in their account."
				action={
					<Button
						variant="outline"
						size="sm"
						nativeButton={false}
						render={<Link to="/account/notifications/preferences" />}
					>
						Your email preferences
					</Button>
				}
			/>
			<SettingsSection
				id="plan"
				title="Plan"
				description={
					plan
						? `${organization.name} runs on the ${getPlanName(plan)} plan.`
						: "The plan's details aren't available right now."
				}
				action={
					isOwner && (
						<Button
							variant="outline"
							size="sm"
							nativeButton={false}
							render={<Link to="/account/billing" />}
						>
							Manage billing
						</Button>
					)
				}
			/>
		</ContentBox>
	);
}
