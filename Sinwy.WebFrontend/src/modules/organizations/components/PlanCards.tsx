import type { PlanSlug } from "@sinwy/shared";
import { ChartColumn, CircleCheck, LayoutTemplate, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "#/shared/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";
import { cn } from "#/shared/lib/utils";

export const plans = [
	{
		slug: "starter",
		name: "Starter",
		description:
			"Everything a small business needs to get online and reach new customers",
		price: 12,
		yearlyPrice: 99,
		buttonText: "Get started",
		buttonVariant: "outline" as const,
		features: [
			{ text: "1 published business page", icon: <LayoutTemplate size={20} /> },
			{ text: "Up to 3 team members", icon: <Users size={20} /> },
			{ text: "Basic visitor analytics", icon: <ChartColumn size={20} /> },
		],
		includes: [
			"Starter includes:",
			"Industry-tailored page templates",
			"Listing in Sinwy discovery",
			"Online booking page",
		],
	},
	{
		slug: "professional",
		name: "Business",
		description:
			"Best for growing businesses that want more customization and reach",
		price: 48,
		yearlyPrice: 399,
		buttonText: "Get started",
		buttonVariant: "default" as const,
		popular: true,
		features: [
			{ text: "Up to 5 published pages", icon: <LayoutTemplate size={20} /> },
			{ text: "Up to 15 team members", icon: <Users size={20} /> },
			{ text: "Advanced analytics", icon: <ChartColumn size={20} /> },
		],
		includes: [
			"Everything in Starter, plus:",
			"Full page builder customization",
			"Custom domain",
			"Featured placement in discovery",
		],
	},
	{
		slug: "enterprise",
		name: "Enterprise",
		description:
			"For established businesses with multiple locations and larger teams",
		price: 96,
		yearlyPrice: 899,
		buttonText: "Get started",
		buttonVariant: "outline" as const,
		features: [
			{ text: "Unlimited published pages", icon: <LayoutTemplate size={20} /> },
			{ text: "Unlimited team members", icon: <Users size={20} /> },
			{ text: "Full analytics & reports", icon: <ChartColumn size={20} /> },
		],
		includes: [
			"Everything in Business, plus:",
			"Multiple locations & branches",
			"Advanced roles & permissions",
			"Priority support",
		],
	},
] satisfies readonly ({ slug: PlanSlug } & Record<string, unknown>)[];

export function getPlanName(slug: PlanSlug) {
	return plans.find((plan) => plan.slug === slug)?.name ?? slug;
}

const PRICE_PLACES = [1000, 100, 10, 1];
// 9 sits at the top of the strip so rolling to a higher digit moves the
// strip downward (and to a lower digit upward), matching the price change
const DIGIT_STRIP = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

function RollingPrice({ value }: { value: number }) {
	return (
		<span className="inline-flex mask-[linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]">
			{PRICE_PLACES.map((place) => {
				// unused leading places (-1) collapse to zero-width columns so
				// extra digits can roll in when the price grows
				const digit =
					place === 1 || value >= place ? Math.floor(value / place) % 10 : -1;
				return (
					<span
						key={place}
						className={cn(
							"block h-[1em] overflow-hidden transition-[width] duration-500",
							digit < 0 ? "w-0" : "w-[1ch]",
						)}
					>
						<span
							className="block transition-transform duration-500 ease-in-out"
							style={{ transform: `translateY(${digit - 9}em)` }}
						>
							{DIGIT_STRIP.map((strip) => (
								<span key={strip} className="block h-[1em] text-center">
									{strip}
								</span>
							))}
						</span>
					</span>
				);
			})}
		</span>
	);
}

type PlanCardsProps = {
	pendingSlug?: string | null;
	pendingText?: string;
	onChoosePlan: (slug: PlanSlug) => void;
};

export function PlanCards({
	pendingSlug = null,
	pendingText = "Redirecting…",
	onChoosePlan,
}: PlanCardsProps) {
	const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

	return (
		<>
			<div className="mb-10 flex justify-center">
				<div className="relative grid grid-cols-2 rounded-full border bg-background/70 p-1">
					<span
						aria-hidden
						className={cn(
							"glass-button absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full border bg-primary bg-clip-padding transition-transform duration-300 ease-out",
							"border-[color-mix(in_oklab,var(--primary),white_15%)] dark:border-[color-mix(in_oklab,var(--primary),white_14%)]",
							billing === "yearly" && "translate-x-full",
						)}
					/>
					<Button
						variant="ghost"
						size="sm"
						className={cn(
							"relative z-10 rounded-full transition-colors hover:bg-transparent",
							billing === "monthly" &&
								"text-primary-foreground hover:text-primary-foreground",
						)}
						onClick={() => setBilling("monthly")}
					>
						Monthly
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className={cn(
							"relative z-10 rounded-full transition-colors hover:bg-transparent",
							billing === "yearly" &&
								"text-primary-foreground hover:text-primary-foreground",
						)}
						onClick={() => setBilling("yearly")}
					>
						Yearly
						<span
							className={cn(
								"rounded-full px-2 py-0.5 text-xs transition-colors",
								billing === "yearly"
									? "bg-primary-foreground/15"
									: "bg-primary/10 text-primary",
							)}
						>
							Save 20%
						</span>
					</Button>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				{plans.map((plan) => (
					<Card
						key={plan.slug}
						className={
							plan.popular
								? "border border-primary ring-3 ring-primary/15"
								: undefined
						}
					>
						<CardHeader>
							<CardTitle className="text-xl font-semibold">
								{plan.name}
							</CardTitle>
							{plan.popular && (
								<CardAction>
									<span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
										Popular
									</span>
								</CardAction>
							)}
							<CardDescription>{plan.description}</CardDescription>
						</CardHeader>

						<CardContent className="space-y-5">
							<p className="font-heading">
								<span className="inline-flex text-4xl leading-none font-bold tracking-tight tabular-nums">
									$
									<RollingPrice
										value={
											billing === "monthly" ? plan.price : plan.yearlyPrice
										}
									/>
								</span>{" "}
								<span className="text-sm text-muted-foreground">
									/{billing === "monthly" ? "month" : "year"}
								</span>
							</p>

							<Button
								variant={plan.buttonVariant}
								size="lg"
								className="w-full"
								disabled={pendingSlug !== null}
								onClick={() => onChoosePlan(plan.slug)}
							>
								{pendingSlug === plan.slug ? pendingText : plan.buttonText}
							</Button>

							<ul className="space-y-3">
								{plan.features.map((feature) => (
									<li
										key={feature.text}
										className="flex items-center gap-2.5 text-sm font-medium"
									>
										<span className="text-muted-foreground">
											{feature.icon}
										</span>
										{feature.text}
									</li>
								))}
							</ul>
						</CardContent>

						<CardFooter className="mt-auto flex-col items-start gap-3 border-t">
							<p className="text-sm font-semibold">{plan.includes[0]}</p>
							<ul className="space-y-3">
								{plan.includes.slice(1).map((item) => (
									<li key={item} className="flex items-center gap-2.5 text-sm">
										<CircleCheck size={20} className="text-primary" />
										{item}
									</li>
								))}
							</ul>
						</CardFooter>
					</Card>
				))}
			</div>
		</>
	);
}
