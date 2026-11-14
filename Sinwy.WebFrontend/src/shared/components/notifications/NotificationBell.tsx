import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { BellIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "#/shared/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "#/shared/components/ui/popover";
import { Skeleton } from "#/shared/components/ui/skeleton";
import {
	markAllNotificationsRead,
	type NotificationScope,
	notificationsQuery,
	unreadCountQuery,
	unreadLabel,
} from "#/shared/lib/notifications";
import { NotificationList } from "./NotificationList";

/** The header bell: unread count, the latest notifications and "Mark all read". `footer` is for a "View all" link. */
export function NotificationBell({
	scope,
	footer,
}: {
	scope: NotificationScope;
	footer?: (close: () => void) => ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();
	const { data: count } = useQuery(unreadCountQuery(scope));
	const list = useInfiniteQuery({
		...notificationsQuery(scope),
		enabled: open,
	});
	const markAll = useMutation({
		mutationFn: () => markAllNotificationsRead(queryClient, scope),
	});
	const notifications = list.data?.pages.flatMap((page) => page.notifications);
	const label = unreadLabel(count);
	const close = () => setOpen(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						className="relative text-muted-foreground"
						aria-label={
							label ? `Notifications, ${label} unread` : "Notifications"
						}
					/>
				}
			>
				<BellIcon />
				{label && (
					<span
						aria-hidden
						data-testid="notification-count"
						className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground tabular-nums"
					>
						{label}
					</span>
				)}
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 gap-0 overflow-hidden p-0">
				<div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
					<PopoverTitle className="text-sm">Notifications</PopoverTitle>
					<Button
						variant="ghost"
						size="xs"
						disabled={!count || markAll.isPending}
						onClick={() => markAll.mutate()}
					>
						Mark all read
					</Button>
				</div>
				{list.isPending ? (
					<div className="p-4">
						<Skeleton className="h-24 rounded-md" />
					</div>
				) : list.isError && !notifications ? (
					<p className="p-4 text-destructive text-sm">{list.error.message}</p>
				) : !notifications?.length ? (
					<p className="px-4 py-8 text-center text-muted-foreground text-sm">
						You're all caught up.
					</p>
				) : (
					<div className="max-h-96 overflow-y-auto">
						<NotificationList
							scope={scope}
							notifications={notifications}
							onOpen={close}
						/>
						{list.hasNextPage && (
							<div className="flex justify-center border-t p-2">
								<Button
									variant="ghost"
									size="xs"
									disabled={list.isFetchingNextPage}
									onClick={() => void list.fetchNextPage()}
								>
									{list.isFetchingNextPage ? "Loading…" : "Load more"}
								</Button>
							</div>
						)}
					</div>
				)}
				{footer && <div className="border-t p-2">{footer(close)}</div>}
			</PopoverContent>
		</Popover>
	);
}
