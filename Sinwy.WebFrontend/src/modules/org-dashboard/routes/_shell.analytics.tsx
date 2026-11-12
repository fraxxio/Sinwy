import type { AnalyticsRangeDto, AnalyticsRangeQuery } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { DownloadIcon } from "lucide-react";
import { BookingsTab } from "#/modules/org-dashboard/components/analytics/BookingsTab";
import { ConversionTab } from "#/modules/org-dashboard/components/analytics/ConversionTab";
import { TrafficTab } from "#/modules/org-dashboard/components/analytics/TrafficTab";
import { DateRangeFilter } from "#/modules/org-dashboard/components/DateRangeFilter";
import { analyticsQuery } from "#/modules/org-dashboard/lib/analytics-queries";
import {
	ANALYTICS_SEARCH_DEFAULTS,
	ANALYTICS_TAB_LABELS,
	ANALYTICS_TABS,
	type AnalyticsTab,
	analyticsExportUrl,
	analyticsPresets,
	analyticsSearchSchema,
} from "#/modules/org-dashboard/lib/analytics-search";
import {
	changeRange,
	clampRange,
	completeDaysRange,
} from "#/modules/org-dashboard/lib/date-range";
import { ORG_SECTIONS } from "#/modules/org-dashboard/lib/sections";
import { ContentBox } from "#/shared/components/ContentBox";
import { PageHeader } from "#/shared/components/PageHeader";
import { PlanGate } from "#/shared/components/PlanGate";
import { buttonVariants } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "#/shared/components/ui/tabs";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/analytics",
)({
	beforeLoad: requirePermission(ORG_SECTIONS.analytics.permission),
	validateSearch: analyticsSearchSchema,
	search: { middlewares: [stripSearchParams(ANALYTICS_SEARCH_DEFAULTS)] },
	staticData: { crumb: "Analytics" },
	component: AnalyticsPage,
});

const isTab = (value: unknown): value is AnalyticsTab =>
	ANALYTICS_TABS.includes(value as AnalyticsTab);

function AnalyticsPage() {
	const { organization } = Route.useRouteContext();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const query = { from: search.from, to: search.to };
	// every plan gets traffic totals, so they carry the resolved range for the whole page
	const traffic = useQuery(analyticsQuery(organization.id, "traffic", query));
	const resolved = traffic.data?.range;

	return (
		<>
			<PageHeader
				title="Analytics"
				description="How your pages, bookings and revenue are trending."
				action={
					resolved && (
						<PlanGate feature="analytics-advanced" mode="hide">
							<a
								href={analyticsExportUrl(organization.id, search.tab, query)}
								download
								className={buttonVariants({ variant: "outline" })}
							>
								<DownloadIcon />
								Export CSV
							</a>
						</PlanGate>
					)
				}
			/>
			<ContentBox>
				{traffic.isError ? (
					<FieldError>{traffic.error.message}</FieldError>
				) : !resolved ? (
					<Skeleton className="h-64 rounded-md" />
				) : (
					<Tabs
						value={search.tab}
						onValueChange={(tab) => {
							if (isTab(tab))
								void navigate({ search: (prev) => ({ ...prev, tab }) });
						}}
						className="gap-4"
					>
						<div className="flex flex-wrap items-end justify-between gap-3">
							<TabsList>
								{ANALYTICS_TABS.map((tab) => (
									<TabsTrigger key={tab} value={tab}>
										{ANALYTICS_TAB_LABELS[tab]}
									</TabsTrigger>
								))}
							</TabsList>
							<RangeFilter
								resolved={resolved}
								search={query}
								onChange={(range) =>
									void navigate({ search: (prev) => ({ ...prev, ...range }) })
								}
							/>
						</div>
						<RangeNotes range={resolved} />
						<TabsContent value="traffic">
							<TrafficTab organizationId={organization.id} range={query} />
						</TabsContent>
						<TabsContent value="conversion">
							<ConversionTab organizationId={organization.id} range={query} />
						</TabsContent>
						<TabsContent value="bookings">
							<BookingsTab organizationId={organization.id} range={query} />
						</TabsContent>
					</Tabs>
				)}
			</ContentBox>
		</>
	);
}

function RangeFilter({
	resolved,
	search,
	onChange,
}: {
	resolved: AnalyticsRangeDto;
	search: AnalyticsRangeQuery;
	onChange: (range: { from: string; to: string }) => void;
}) {
	const retention = completeDaysRange(
		resolved.retentionDays,
		resolved.timezone,
	);
	const range = clampRange(
		{ from: search.from ?? resolved.from, to: search.to ?? resolved.to },
		retention,
	);

	return (
		<DateRangeFilter
			{...range}
			min={retention.from}
			max={retention.to}
			presets={analyticsPresets(resolved.timezone)}
			onChange={(change) => onChange(changeRange(range, change))}
		/>
	);
}

function RangeNotes({ range }: { range: AnalyticsRangeDto }) {
	return (
		<p className="text-muted-foreground text-sm">
			Traffic updates once a day, so the latest day shown is yesterday.
			{range.clamped &&
				` Your plan shows the last ${range.retentionDays} days.`}
		</p>
	);
}
