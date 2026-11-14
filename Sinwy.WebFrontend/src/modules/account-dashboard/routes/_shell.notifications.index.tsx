import { NOTIFICATION_RETENTION_DAYS } from "@sinwy/shared";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";
import { NotificationList } from "#/shared/components/notifications/NotificationList";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import {
	markAllNotificationsRead,
	notificationsQuery,
	unreadCountQuery,
} from "#/shared/lib/notifications";

export const Route = createFileRoute("/account/_shell/notifications/")({
	component: InboxPage,
});

function InboxPage() {
	const queryClient = useQueryClient();
	const list = useInfiniteQuery(notificationsQuery(null));
	const { data: unread } = useQuery(unreadCountQuery(null));
	const markAll = useMutation({
		mutationFn: () => markAllNotificationsRead(queryClient, null),
	});
	const notifications =
		list.data?.pages.flatMap((page) => page.notifications) ?? [];

	return (
		<ContentBox className="gap-4">
			{list.isPending ? (
				<Skeleton className="h-64 rounded-md" />
			) : list.isError && notifications.length === 0 ? (
				<FieldError>{list.error.message}</FieldError>
			) : notifications.length === 0 ? (
				<EmptyState
					icon={<BellIcon />}
					title="You're all caught up"
					description={`Updates about your bookings, invitations and ownership offers show up here for ${NOTIFICATION_RETENTION_DAYS} days.`}
					className="border-none"
				/>
			) : (
				<div className="flex max-w-3xl flex-col gap-4">
					<div className="flex justify-end">
						<Button
							variant="outline"
							size="sm"
							disabled={!unread || markAll.isPending}
							onClick={() => markAll.mutate()}
						>
							Mark all read
						</Button>
					</div>
					{markAll.isError && <FieldError>{markAll.error.message}</FieldError>}
					<NotificationList
						scope={null}
						notifications={notifications}
						className="-mx-4"
					/>
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
