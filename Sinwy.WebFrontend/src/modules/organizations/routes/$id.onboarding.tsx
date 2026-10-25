import {
	type AccountSubscriptionDto,
	EMPTY_ORGANIZATION_PROFILE,
	ORGANIZATION_INDUSTRY_OPTIONS,
	type OrganizationOnboardingDto,
} from "@sinwy/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { LockIcon } from "lucide-react";
import {
	freeSlots,
	invalidateSubscription,
	subscriptionQuery,
} from "#/modules/account-dashboard/lib/billing-queries";
import {
	BusinessProfileForm,
	type BusinessProfileValues,
} from "#/modules/organizations/components/BusinessProfileForm";
import { postLoginFlagsKey } from "#/modules/user/lib/usePostLoginFlags";
import { Button } from "#/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { toast } from "#/shared/components/ui/toast";
import { api } from "#/shared/lib/api";
import { authClient } from "#/shared/lib/auth/auth-client";
import {
	requireAuth,
	requireMember,
	requirePermission,
} from "#/shared/lib/auth/protected-route";
import {
	invalidateOrganizations,
	isOrganizationOpen,
	organizationsQuery,
	reactivationLink,
} from "#/shared/lib/organizations";
import { getPlanName } from "#/shared/lib/plans";
import { cn } from "#/shared/lib/utils";

export const Route = createFileRoute("/organizations/$id/onboarding")({
	ssr: false,
	beforeLoad: async ({ location, params, context, preload }) => {
		const ctx = await requireAuth({ location });
		const summary = await context.queryClient
			.fetchQuery({ ...organizationsQuery, staleTime: 0 })
			.then((list) => list.find((org) => org.id === params.id));
		if (!summary) throw redirect({ to: "/" });
		// fail closed: only an active org or its owner's draft is set up here
		const draft = summary.draft && summary.isOwner;
		if (!isOrganizationOpen(summary) && !draft)
			throw redirect(reactivationLink(summary) ?? { to: "/account" });
		// read, not set active: the backend refuses to open a draft
		const { data: organization, error } =
			await authClient.organization.getFullOrganization({
				query: { organizationId: params.id, membersLimit: 1 },
			});
		if (error || !organization) throw redirect({ to: "/" });
		const member = await requireMember(context.queryClient, organization.id);
		requirePermission("settings:manage")({
			context: { organization, member },
			preload,
		});
		return { ...ctx, organization, draft };
	},
	loader: async ({ params, context }) => {
		const [res, subscription] = await Promise.all([
			api<OrganizationOnboardingDto>(`/organizations/${params.id}/onboarding`),
			// a draft's notice depends on the owner's plan and free slots
			context.draft
				? context.queryClient
						.fetchQuery({ ...subscriptionQuery, staleTime: 0 })
						.catch(() => null)
				: null,
		]);
		return {
			onboarding: res.isSuccess ? res.data : null,
			subscription,
			error: res.isSuccess ? null : res.message,
		};
	},
	component: OnboardingPage,
	pendingComponent: OnboardingPending,
	pendingMs: 0,
});

function PageShell({
	title,
	description,
	children,
}: {
	title: React.ReactNode;
	description: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<main className="page-wrap py-14">
			<div className="mx-auto w-full max-w-2xl space-y-6">
				<div className="space-y-1.5">
					<h1 className="text-2xl font-bold tracking-tight">{title}</h1>
					<div className="text-sm text-muted-foreground">{description}</div>
				</div>
				{children}
			</div>
		</main>
	);
}

function StepBadge({
	children,
	muted,
}: {
	children: React.ReactNode;
	muted?: boolean;
}) {
	return (
		<span
			className={cn(
				"flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
				muted
					? "border-dashed border-foreground/30 text-muted-foreground"
					: "border-primary text-primary dark:border-[color-mix(in_oklch,var(--primary),white_30%)] dark:text-[color-mix(in_oklch,var(--primary),white_30%)]",
			)}
		>
			{children}
		</span>
	);
}

function LockedStep({
	index,
	title,
	description,
}: {
	index: number;
	title: string;
	description: string;
}) {
	return (
		<li className="flex items-start gap-3 rounded-lg border border-dashed p-4">
			<StepBadge muted>{index}</StepBadge>
			<div className="space-y-1">
				<p className="flex flex-wrap items-center gap-2 text-sm font-medium">
					{title}
					<span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
						Coming soon
					</span>
				</p>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			<LockIcon
				className="ml-auto size-4 shrink-0 text-muted-foreground"
				aria-hidden
			/>
		</li>
	);
}

function OnboardingPending() {
	return (
		<PageShell
			title={<Skeleton className="h-7 w-52 rounded-md" />}
			description={<Skeleton className="h-3.5 w-80 max-w-full rounded-md" />}
		>
			<Skeleton className="h-140 rounded-xl" />
			<Skeleton className="h-20 rounded-lg" />
			<Skeleton className="h-20 rounded-lg" />
		</PageShell>
	);
}

/** Whether saving a draft's wizard activates it, and what to tell its owner. */
function draftNotice(
	organizationName: string,
	subscription: AccountSubscriptionDto | null,
) {
	if (!subscription)
		return {
			activates: false,
			text: `${organizationName} is a draft. We couldn't check your plan, so saving keeps it a draft; activate it from your organizations.`,
		};
	if (subscription.suspended)
		return {
			activates: false,
			text: `${organizationName} stays a draft while your plan is suspended. Resume your plan on Billing, then activate it from your organizations.`,
		};
	if (subscription.plan === null)
		return {
			activates: false,
			text: `${organizationName} stays a draft until you choose a plan on Billing.`,
		};
	if (freeSlots(subscription) === 0)
		return {
			activates: false,
			text: `Your ${getPlanName(subscription.plan)} plan has no free organization slot, so ${organizationName} stays a draft until one is free. Deactivate another organization, or upgrade on Billing.`,
		};
	return {
		activates: true,
		text: `Saving activates ${organizationName} on your ${getPlanName(subscription.plan)} plan.`,
	};
}

function OnboardingPage() {
	const { id } = Route.useParams();
	const { organization, draft } = Route.useRouteContext();
	const { onboarding, subscription, error } = Route.useLoaderData();
	const router = useRouter();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const industry = ORGANIZATION_INDUSTRY_OPTIONS.find(
		(option) => option.value === organization.industry,
	);

	if (error)
		return (
			<PageShell
				title="We couldn't load your setup"
				description={`${error}. Try again, or head to your dashboard and come back later.`}
			>
				<div className="flex gap-2">
					<Button variant="outline" onClick={() => void router.invalidate()}>
						Try again
					</Button>
					{draft ? (
						<OrganizationsButton />
					) : (
						<DashboardButton slug={organization.slug} label="Go to dashboard" />
					)}
				</div>
			</PageShell>
		);

	const completed = !!onboarding?.completedAt;
	const profile = onboarding?.profile ?? EMPTY_ORGANIZATION_PROFILE;

	const goToDashboard = () =>
		navigate({
			to: "/$organizationSlug",
			params: { organizationSlug: organization.slug },
		});

	const notice = draft ? draftNotice(organization.name, subscription) : null;

	const save = async (values: BusinessProfileValues) => {
		const saved = await api(`/organizations/${id}/profile`, {
			method: "PUT",
			body: JSON.stringify(values),
		});
		if (!saved.isSuccess) return saved.message;

		// a draft without a free slot keeps its profile and stays a draft
		if (notice && !notice.activates) {
			toast.add({ type: "success", title: "Profile saved", timeout: 4_000 });
			await navigate({ to: "/account/organizations" });
			return null;
		}

		if (!completed) {
			const done = await api(`/organizations/${id}/onboarding/complete`, {
				method: "POST",
			});
			if (!done.isSuccess)
				return `Your profile was saved, but the step couldn't be marked done (${done.message}). Submitting again is safe.`;
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: postLoginFlagsKey }),
				invalidateOrganizations(queryClient),
				invalidateSubscription(queryClient),
			]);
		}

		await goToDashboard();
		return null;
	};

	return (
		<PageShell
			title={completed ? "Your business profile" : "Welcome aboard"}
			description={
				completed
					? `Update what customers see about ${organization.name}.`
					: notice
						? "Tell customers who you are, and the rest of the setup builds on it."
						: "Your organization is active. Tell customers who you are, and the rest of the setup builds on it."
			}
		>
			{notice && (
				<div
					role="status"
					className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4 text-sm"
				>
					<p>{notice.text}</p>
					{!notice.activates && (
						<Button
							variant="outline"
							size="sm"
							nativeButton={false}
							render={<Link to="/account/billing" />}
						>
							Go to Billing
						</Button>
					)}
				</div>
			)}
			<ol className="space-y-3">
				<li>
					<Card>
						<CardHeader>
							<div className="flex items-start gap-3">
								<StepBadge>1</StepBadge>
								<div className="space-y-1.5">
									<CardTitle>Business profile</CardTitle>
									<CardDescription>
										How customers find and contact you. Every page template and
										your listing fill themselves in from this.
									</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<BusinessProfileForm
								profile={profile}
								submitLabel={
									completed
										? "Save changes"
										: notice && !notice.activates
											? "Save profile"
											: "Save and continue"
								}
								pendingLabel="Saving…"
								onSubmit={save}
							>
								{draft ? (
									<Button
										type="button"
										variant="ghost"
										className="w-full"
										onClick={() =>
											void navigate({ to: "/account/organizations" })
										}
									>
										Back to organizations
									</Button>
								) : (
									<Button
										type="button"
										variant="ghost"
										className="w-full"
										onClick={() => void goToDashboard()}
									>
										{completed ? "Back to dashboard" : "I'll do this later"}
									</Button>
								)}
							</BusinessProfileForm>
						</CardContent>
					</Card>
				</li>

				<LockedStep
					index={2}
					title="Design your page"
					description={`Start from a template built for ${industry?.label.toLowerCase() ?? "your industry"} and swap in your own words and photos.`}
				/>
				<LockedStep
					index={3}
					title="Bookings, payments & calendar"
					description="Switch on the tools your business runs on, only the ones you need."
				/>
			</ol>
		</PageShell>
	);
}

function DashboardButton({ slug, label }: { slug: string; label: string }) {
	return (
		<Button
			render={
				<Link to="/$organizationSlug" params={{ organizationSlug: slug }} />
			}
		>
			{label}
		</Button>
	);
}

function OrganizationsButton() {
	return (
		<Button nativeButton={false} render={<Link to="/account/organizations" />}>
			Go to organizations
		</Button>
	);
}
