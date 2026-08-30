import type { PlanSlug } from "@sinwy/shared";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	CalendarDays,
	ChartColumn,
	Compass,
	CreditCard,
	LayoutTemplate,
	Sparkles,
	Users,
} from "lucide-react";
import { PlanCards } from "#/modules/organizations/components/PlanCards";
import { savePreselectedPlan } from "#/modules/organizations/lib/preselected-plan";
import { Button } from "#/shared/components/ui/button";

export const Route = createFileRoute("/")({ component: HomePage });

const REGISTER_SEARCH = { source: "business" };

const features = [
	{
		icon: LayoutTemplate,
		title: "Content & service pages",
		description:
			"Build a polished business page with your services, photos, and story — no developer or separate website needed.",
	},
	{
		icon: CalendarDays,
		title: "Bookings & calendars",
		description:
			"Let customers book your services online. Availability, schedules, and reminders stay in sync in one calendar.",
	},
	{
		icon: Users,
		title: "Team management",
		description:
			"Invite your team, assign roles, and manage who handles which services and bookings.",
	},
	{
		icon: CreditCard,
		title: "Payments",
		description:
			"Take payments for bookings and services online, with everything tracked in one place.",
	},
	{
		icon: Compass,
		title: "Discovery platform",
		description:
			"Every business gets listed in Sinwy discovery, where new customers browse and find services near them.",
	},
	{
		icon: ChartColumn,
		title: "Analytics",
		description:
			"See page visits, booking trends, and what brings customers in — so you know what's working.",
	},
] as const;

const steps = [
	{
		title: "Create your page",
		description:
			"Pick an industry-tailored template and fill in your services, hours, and team in minutes.",
	},
	{
		title: "Open your calendar",
		description:
			"Set your availability and start taking bookings and payments online right away.",
	},
	{
		title: "Get discovered",
		description:
			"Your business appears in Sinwy discovery, where customers already look for services like yours.",
	},
] as const;

function HomePage() {
	const navigate = useNavigate();

	const choosePlan = (slug: PlanSlug) => {
		savePreselectedPlan(slug);
		void navigate({ to: "/auth/register", search: REGISTER_SEARCH });
	};

	return (
		<main className="page-wrap relative isolate pb-16">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-10 -z-10 mx-auto h-96 w-full max-w-3xl rounded-full bg-primary/20 blur-3xl"
			/>

			<section className="rise-in mx-auto flex max-w-3xl flex-col items-center py-20 text-center sm:py-28">
				<p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-background/70 px-4 py-1.5 text-sm text-muted-foreground">
					<Sparkles size={16} className="text-primary" />
					The all-in-one platform for service businesses
				</p>
				<h1 className="font-heading mb-6 text-5xl font-bold tracking-tight text-balance sm:text-7xl">
					Your business, online and{" "}
					<span className="text-primary">bookable</span>
				</h1>
				<p className="mb-8 max-w-2xl text-lg text-muted-foreground text-balance">
					Sinwy gives your business a beautiful page, online bookings, payments,
					and team tools — and puts you in front of customers on our discovery
					platform.
				</p>
				<div className="flex flex-wrap justify-center gap-3">
					<Button
						size="lg"
						nativeButton={false}
						render={<Link to="/auth/register" search={REGISTER_SEARCH} />}
					>
						Create your account
					</Button>
					<Button
						size="lg"
						variant="outline"
						nativeButton={false}
						render={<a href="#products">Explore the product</a>}
					/>
				</div>
			</section>

			<section id="products" className="scroll-mt-24 py-14">
				<div className="mx-auto mb-10 max-w-2xl space-y-3 text-center">
					<h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
						Everything you need to run your business
					</h2>
					<p className="text-muted-foreground">
						Stop stitching together a website, a booking tool, and a payment
						provider. Sinwy covers it all.
					</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{features.map((feature, index) => (
						<article
							key={feature.title}
							className="rise-in rounded-2xl border bg-background/70 p-6"
							style={{ animationDelay: `${index * 80}ms` }}
						>
							<feature.icon className="mb-4 size-6 text-primary" />
							<h3 className="mb-2 font-semibold">{feature.title}</h3>
							<p className="m-0 text-sm text-muted-foreground">
								{feature.description}
							</p>
						</article>
					))}
				</div>
			</section>

			<section id="solutions" className="scroll-mt-24 py-14">
				<div className="mx-auto mb-10 max-w-2xl space-y-3 text-center">
					<h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
						From sign-up to first booking in a day
					</h2>
					<p className="text-muted-foreground">
						Whether you run a salon, a clinic, a studio, or a workshop — Sinwy
						adapts to how your business works.
					</p>
				</div>
				<div className="grid gap-4 md:grid-cols-3">
					{steps.map((step, index) => (
						<article
							key={step.title}
							className="rounded-2xl border bg-background/70 p-6"
						>
							<span className="mb-4 inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
								{index + 1}
							</span>
							<h3 className="mb-2 font-semibold">{step.title}</h3>
							<p className="m-0 text-sm text-muted-foreground">
								{step.description}
							</p>
						</article>
					))}
				</div>
			</section>

			<section id="pricing" className="scroll-mt-24 py-14">
				<div className="mx-auto mb-8 max-w-2xl space-y-3 text-center">
					<h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
						Plans that work best for your{" "}
						<span className="text-primary">business</span>
					</h2>
					<p className="text-muted-foreground">
						Start small and grow. Pick a plan now and we'll keep it ready for
						you through sign-up.
					</p>
				</div>
				<PlanCards onChoosePlan={choosePlan} />
			</section>

			<section className="py-14">
				<div className="rounded-3xl border bg-primary/5 px-6 py-14 text-center">
					<h2 className="font-heading mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
						Ready to put your business on the map?
					</h2>
					<p className="mx-auto mb-8 max-w-xl text-muted-foreground">
						Create your account, set up your page, and start taking bookings
						today.
					</p>
					<Button
						size="lg"
						nativeButton={false}
						render={<Link to="/auth/register" search={REGISTER_SEARCH} />}
					>
						Create your account
					</Button>
				</div>
			</section>
		</main>
	);
}
