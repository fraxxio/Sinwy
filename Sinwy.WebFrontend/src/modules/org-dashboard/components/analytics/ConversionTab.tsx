import type {
	AnalyticsFunnelStep,
	AnalyticsRangeQuery,
	FunnelDto,
} from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { FilterIcon } from "lucide-react";
import {
	formatCount,
	formatRate,
} from "#/modules/org-dashboard/components/analytics/AnalyticsWidgets";
import { analyticsQuery } from "#/modules/org-dashboard/lib/analytics-queries";
import { EmptyState } from "#/shared/components/EmptyState";
import { FlatCard } from "#/shared/components/FlatCard";
import { PlanGate } from "#/shared/components/PlanGate";
import { UpgradePrompt } from "#/shared/components/UpgradePrompt";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";

const STEP_LABELS: Record<AnalyticsFunnelStep, string> = {
	viewed: "Visited",
	started: "Started booking",
	booked: "Booked online",
};

const share = (count: number, of: number) => (of > 0 ? count / of : null);

export function ConversionTab(props: {
	organizationId: string;
	range: AnalyticsRangeQuery;
}) {
	return (
		<PlanGate
			feature="analytics-advanced"
			fallback={
				<UpgradePrompt feature="analytics-advanced" className="border-none" />
			}
		>
			<Funnel {...props} />
		</PlanGate>
	);
}

function Funnel({
	organizationId,
	range,
}: {
	organizationId: string;
	range: AnalyticsRangeQuery;
}) {
	const funnel = useQuery(analyticsQuery(organizationId, "funnel", range));

	if (funnel.isError) return <FieldError>{funnel.error.message}</FieldError>;
	if (!funnel.data) return <Skeleton className="h-64 rounded-md" />;

	const { steps } = funnel.data;
	if (steps.every((step) => step.count === 0))
		return (
			<EmptyState
				icon={<FilterIcon />}
				title="No visitors in this range"
				description="The funnel fills in as visitors reach your booking page and book."
				className="border-none"
			/>
		);

	return <FunnelSteps steps={steps} />;
}

function FunnelSteps({ steps }: { steps: FunnelDto["steps"] }) {
	const first = steps[0]?.count ?? 0;
	const last = steps.at(-1)?.count ?? 0;

	return (
		<FlatCard>
			<CardHeader>
				<CardTitle>Booking funnel</CardTitle>
				<CardDescription>
					{formatRate(share(last, first))} of visitors booked online. Visitors
					are counted once a day; bookings are those made from your storefront.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ol className="grid gap-4">
					{steps.map((step, index) => {
						const previous = steps[index - 1];
						const width = Math.max((share(step.count, first) ?? 0) * 100, 1);
						return (
							<li key={step.step} className="grid gap-1.5">
								<div className="flex items-baseline justify-between gap-4 text-sm">
									<span className="font-medium">{STEP_LABELS[step.step]}</span>
									<span className="text-muted-foreground tabular-nums">
										<span className="font-semibold text-foreground">
											{formatCount(step.count)}
										</span>
										{previous &&
											` · ${formatRate(share(step.count, previous.count))} of ${STEP_LABELS[previous.step].toLowerCase()}`}
									</span>
								</div>
								<div className="h-3 rounded-full bg-muted">
									<div
										className="h-3 rounded-full bg-chart-2"
										style={{ width: `${width}%` }}
									/>
								</div>
							</li>
						);
					})}
				</ol>
			</CardContent>
		</FlatCard>
	);
}
