import {
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
import { authClient } from "#/modules/auth/lib/auth-client";
import { requireAuth } from "#/modules/auth/lib/protected-route";
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
import { api } from "#/shared/lib/api";
import { cn } from "#/shared/lib/utils";

export const Route = createFileRoute("/organizations/$id/onboarding")({
	ssr: false,
	beforeLoad: async ({ location, params }) => {
		const ctx = await requireAuth({ location });
		const { data: organization, error } =
			await authClient.organization.setActive({ organizationId: params.id });
		if (error || !organization) throw redirect({ to: "/" });
		// fail closed: anything but a confirmed active org goes back to the funnel
		if (organization.status !== "active")
			throw redirect({
				to: "/organizations/$id/plan",
				params: { id: params.id },
			});
		return { ...ctx, organization };
	},
	loader: async ({ params }) => {
		const res = await api<OrganizationOnboardingDto>(
			`/organizations/${params.id}/onboarding`,
		);
		return {
			onboarding: res.isSuccess ? res.data : null,
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
					<p className="text-sm text-muted-foreground">{description}</p>
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

function OnboardingPage() {
	const { id } = Route.useParams();
	const { organization } = Route.useRouteContext();
	const { onboarding, error } = Route.useLoaderData();
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
					<DashboardButton slug={organization.slug} label="Go to dashboard" />
				</div>
			</PageShell>
		);

	const completed = !!onboarding?.completedAt;
	const profile = onboarding?.profile ?? EMPTY_ORGANIZATION_PROFILE;

	const goToDashboard = () =>
		navigate({
			to: "/$organizationSlug/home",
			params: { organizationSlug: organization.slug },
		});

	const save = async (values: BusinessProfileValues) => {
		const saved = await api(`/organizations/${id}/profile`, {
			method: "PUT",
			body: JSON.stringify(values),
		});
		if (!saved.isSuccess) return saved.message;

		if (!completed) {
			const done = await api(`/organizations/${id}/onboarding/complete`, {
				method: "POST",
			});
			if (!done.isSuccess)
				return `Your profile was saved, but the step couldn't be marked done (${done.message}). Submitting again is safe.`;
			await queryClient.invalidateQueries({ queryKey: postLoginFlagsKey });
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
					: "Your organization is active. Tell customers who you are, and the rest of the setup builds on it."
			}
		>
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
								submitLabel={completed ? "Save changes" : "Save and continue"}
								pendingLabel="Saving…"
								onSubmit={save}
							>
								<Button
									type="button"
									variant="ghost"
									className="w-full"
									onClick={() => void goToDashboard()}
								>
									{completed ? "Back to dashboard" : "I'll do this later"}
								</Button>
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
				<Link
					to="/$organizationSlug/home"
					params={{ organizationSlug: slug }}
				/>
			}
		>
			{label}
		</Button>
	);
}
