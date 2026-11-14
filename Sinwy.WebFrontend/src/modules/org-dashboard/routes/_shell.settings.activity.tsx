import {
	ACTIVITY_RETENTION_DAYS,
	type OrganizationActivityDto,
} from "@sinwy/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";
import { HistoryIcon } from "lucide-react";
import {
	activityQuery,
	activitySentence,
	SYSTEM_ACTOR_NAME,
} from "#/modules/org-dashboard/lib/activity";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";
import { initials } from "#/shared/components/shell/display-name";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "#/shared/components/ui/avatar";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/settings/activity",
)({
	staticData: { crumb: "Activity" },
	component: ActivityPage,
});

function ActivityPage() {
	const { organization } = Route.useRouteContext();
	const list = useInfiniteQuery(activityQuery(organization.id));
	const entries = list.data?.pages.flatMap((page) => page.entries) ?? [];

	return (
		<ContentBox className="gap-4">
			{list.isPending ? (
				<Skeleton className="h-64 rounded-md" />
			) : list.isError && entries.length === 0 ? (
				<FieldError>{list.error.message}</FieldError>
			) : entries.length === 0 ? (
				<EmptyState
					icon={<HistoryIcon />}
					title="No activity yet"
					description={`Changes to the team, pages, services and ownership show up here for ${ACTIVITY_RETENTION_DAYS} days.`}
					className="border-none"
				/>
			) : (
				<div className="flex max-w-3xl flex-col gap-4">
					<ol className="divide-y">
						{entries.map((entry) => (
							<ActivityItem key={entry.id} entry={entry} />
						))}
					</ol>
					{list.isFetchNextPageError && (
						<FieldError>{list.error?.message}</FieldError>
					)}
					{list.hasNextPage && (
						<Button
							variant="outline"
							size="sm"
							className="self-center"
							disabled={list.isFetchingNextPage}
							onClick={() => void list.fetchNextPage()}
						>
							{list.isFetchingNextPage ? "Loading…" : "Load more"}
						</Button>
					)}
				</div>
			)}
		</ContentBox>
	);
}

function ActivityItem({ entry }: { entry: OrganizationActivityDto }) {
	const name = entry.actor?.name || SYSTEM_ACTOR_NAME;
	return (
		<li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
			<Avatar size="sm" className="mt-0.5">
				{entry.actor?.image && <AvatarImage src={entry.actor.image} alt="" />}
				<AvatarFallback>{initials(name)}</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1 text-sm">
				<p>
					<span className="font-medium">{name}</span> {activitySentence(entry)}
				</p>
				<time
					dateTime={entry.occurredAt}
					title={format(entry.occurredAt, "PPpp")}
					className="text-muted-foreground text-xs"
				>
					{formatDistanceToNow(entry.occurredAt, { addSuffix: true })}
				</time>
			</div>
		</li>
	);
}
