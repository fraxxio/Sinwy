import type {
	AccountSubscriptionDto,
	OrganizationSummary,
} from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2Icon } from "lucide-react";
import { useState } from "react";
import { IncomingTransfers } from "#/modules/account-dashboard/components/IncomingTransfers";
import {
	freeSlots,
	invalidateSubscription,
	type OrganizationSlotAction,
	runOrganizationSlotAction,
	subscriptionQuery,
} from "#/modules/account-dashboard/lib/billing-queries";
import { postLoginFlagsKey } from "#/modules/user/lib/usePostLoginFlags";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/shared/components/ui/alert-dialog";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { toast } from "#/shared/components/ui/toast";
import {
	closedOrganizationBadge,
	closedOrganizationReason,
	invalidateOrganizations,
	isOrganizationOpen,
	organizationsQuery,
	reactivationLink,
} from "#/shared/lib/organizations";
import { getPlanName } from "#/shared/lib/plans";

export const Route = createFileRoute("/account/_shell/organizations")({
	staticData: { crumb: "Organizations" },
	component: OrganizationsPage,
});

const createLink = (
	<Button nativeButton={false} render={<Link to="/organizations/new" />}>
		Create organization
	</Button>
);

function OrganizationsPage() {
	const {
		data: organizations,
		isPending,
		isError,
	} = useQuery(organizationsQuery);
	// slots are the owner's; members of someone else's org don't need the plan
	const ownsAny = organizations?.some((org) => org.isOwner) ?? false;
	const { data: subscription } = useQuery({
		...subscriptionQuery,
		enabled: ownsAny,
	});

	if (organizations?.length === 0)
		return (
			<>
				<PageHeader
					title="Organizations"
					description="Organizations you own or belong to."
				/>
				<EmptyState
					icon={<Building2Icon />}
					title="No organizations yet"
					description="Create an organization to take bookings, publish pages and get paid."
					action={createLink}
				/>
			</>
		);

	return (
		<>
			<PageHeader
				title="Organizations"
				description="Organizations you own or belong to."
				action={organizations && createLink}
			/>
			<IncomingTransfers />
			{subscription && <SlotUsage subscription={subscription} />}
			<ContentBox>
				{isPending ? (
					<Skeleton className="h-24" />
				) : isError ? (
					<FieldError>
						Couldn't load your organizations. Reload to retry.
					</FieldError>
				) : (
					<ul className="divide-y">
						{organizations.map((org) => (
							<OrganizationRow
								key={org.id}
								organization={org}
								subscription={subscription ?? null}
							/>
						))}
					</ul>
				)}
			</ContentBox>
		</>
	);
}

function SlotUsage({ subscription }: { subscription: AccountSubscriptionDto }) {
	const text = subscription.suspended
		? "Your plan is suspended, so none of your organizations are online."
		: subscription.plan
			? `${subscription.activeOrganizations} of ${subscription.organizationLimit} organizations active on your ${getPlanName(subscription.plan)} plan.`
			: "You have no plan, so none of your organizations are active.";

	return (
		<div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
			<p className="text-muted-foreground">{text}</p>
			<Button
				variant="outline"
				size="sm"
				nativeButton={false}
				render={<Link to="/account/billing" />}
			>
				{subscription.plan ? "Manage plan" : "Choose a plan"}
			</Button>
		</div>
	);
}

/** What the owner can do about one of their organizations that isn't open. */
function slotOptions(
	organization: OrganizationSummary,
	subscription: AccountSubscriptionDto | null,
) {
	if (!subscription) return null;
	if (subscription.suspended) return { kind: "resume" } as const;
	if (!subscription.plan) return { kind: "choose-plan" } as const;
	return freeSlots(subscription) > 0
		? ({ kind: "activate" } as const)
		: ({ kind: "at-cap", draft: organization.draft } as const);
}

function useSlotAction(organization: OrganizationSummary) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (action: OrganizationSlotAction) => {
			const res = await runOrganizationSlotAction(organization.id, action);
			if (!res.isSuccess) throw new Error(res.message);
		},
		onSuccess: (_, action) =>
			toast.add({
				type: "success",
				title:
					action === "activate"
						? `${organization.name} is active`
						: `${organization.name} is deactivated`,
				timeout: 4_000,
			}),
		onError: (error) =>
			toast.add({
				type: "error",
				title: "Couldn't change the organization",
				description: error.message,
			}),
		// a refusal usually means the plan or slots moved; show what they are now
		onSettled: () =>
			Promise.all([
				invalidateOrganizations(queryClient),
				invalidateSubscription(queryClient),
				queryClient.invalidateQueries({ queryKey: postLoginFlagsKey }),
			]),
	});
}

function OrganizationRow({
	organization,
	subscription,
}: {
	organization: OrganizationSummary;
	subscription: AccountSubscriptionDto | null;
}) {
	const open = isOrganizationOpen(organization);
	const link = reactivationLink(organization);
	const options = link ? slotOptions(organization, subscription) : null;
	const slotAction = useSlotAction(organization);

	return (
		<li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
			<div className="grid gap-0.5 text-sm">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium">{organization.name}</span>
					<Badge variant="secondary">
						{organization.isOwner ? "Owner" : "Member"}
					</Badge>
					{open ? (
						<Badge variant="outline">
							{organization.plan ? getPlanName(organization.plan) : "Active"}
						</Badge>
					) : (
						<Badge variant={organization.deletesAt ? "destructive" : "outline"}>
							{closedOrganizationBadge(organization)}
						</Badge>
					)}
				</div>
				{!open && (
					<span className="text-xs text-muted-foreground">
						{closedOrganizationReason(organization)}
						{link
							? options?.kind === "at-cap" &&
								". Your plan has no free slot; deactivate another organization or upgrade."
							: !organization.deletesAt &&
								(organization.suspended
									? ". Ask the owner to resume it."
									: ". Ask the owner to activate it.")}
					</span>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{open && organization.isOwner && (
					<DeactivateButton
						organization={organization}
						pending={slotAction.isPending}
						onConfirm={() => slotAction.mutate("deactivate")}
					/>
				)}
				{open ? (
					<Button
						variant="outline"
						size="sm"
						nativeButton={false}
						render={
							<Link
								to="/$organizationSlug"
								params={{ organizationSlug: organization.slug }}
							/>
						}
					>
						Open
					</Button>
				) : options?.kind === "activate" ? (
					<Button
						size="sm"
						disabled={slotAction.isPending}
						onClick={() => slotAction.mutate("activate")}
					>
						{slotAction.isPending ? "Activating…" : "Activate"}
					</Button>
				) : options?.kind === "at-cap" ? (
					<>
						<Button size="sm" variant="outline" disabled>
							Activate
						</Button>
						<Button
							size="sm"
							nativeButton={false}
							render={
								<Link to="/account/billing" search={{ change: "plan" }} />
							}
						>
							Upgrade
						</Button>
					</>
				) : options ? (
					<Button
						size="sm"
						nativeButton={false}
						render={<Link to="/account/billing" />}
					>
						{options.kind === "resume" ? "Resume plan" : "Choose a plan"}
					</Button>
				) : null}
			</div>
		</li>
	);
}

function DeactivateButton({
	organization,
	pending,
	onConfirm,
}: {
	organization: OrganizationSummary;
	pending: boolean;
	onConfirm: () => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger
				render={<Button variant="ghost" size="sm" disabled={pending} />}
			>
				Deactivate
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Deactivate {organization.name}?</AlertDialogTitle>
					<AlertDialogDescription>
						It goes offline now: members lose access and its public pages stop.
						Its data is kept, and its slot is free for another organization.
						Activate it again whenever a slot is free.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						onClick={() => {
							setOpen(false);
							onConfirm();
						}}
					>
						Deactivate
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
