import type { NotificationDto } from "@sinwy/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";
import {
	markNotificationRead,
	type NotificationScope,
	notificationText,
} from "#/shared/lib/notifications";
import { cn } from "#/shared/lib/utils";

/** Opening an item marks it read and follows its link. */
export function NotificationList({
	scope,
	notifications,
	onOpen,
	className,
}: {
	scope: NotificationScope;
	notifications: NotificationDto[];
	onOpen?: () => void;
	className?: string;
}) {
	const queryClient = useQueryClient();
	const router = useRouter();

	const open = async (notification: NotificationDto) => {
		onOpen?.();
		if (!notification.readAt)
			void markNotificationRead(queryClient, scope, notification.id);
		if (notification.link) await router.navigate({ href: notification.link });
	};

	return (
		<ul className={cn("divide-y", className)}>
			{notifications.map((notification) => {
				const { title, detail } = notificationText(notification);
				const unread = !notification.readAt;
				return (
					<li key={notification.id}>
						<button
							type="button"
							onClick={() => void open(notification)}
							className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
						>
							<span
								aria-hidden
								className={cn(
									"mt-1.5 size-2 shrink-0 rounded-full",
									unread ? "bg-primary" : "bg-transparent",
								)}
							/>
							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className={cn(unread && "font-medium")}>
									{unread && <span className="sr-only">Unread: </span>}
									{title}
								</span>
								<span className="truncate text-muted-foreground text-xs">
									{detail}
								</span>
								<time
									dateTime={notification.createdAt}
									title={format(notification.createdAt, "PPpp")}
									className="text-muted-foreground text-xs"
								>
									{formatDistanceToNow(notification.createdAt, {
										addSuffix: true,
									})}
								</time>
							</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
