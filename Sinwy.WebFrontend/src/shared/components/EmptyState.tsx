import type { ReactNode } from "react";
import { cn } from "#/shared/lib/utils";

export function EmptyState({
	icon,
	title,
	description,
	action,
	className,
}: {
	icon: ReactNode;
	title: string;
	description: string;
	action?: ReactNode;
	className?: string | undefined;
}) {
	return (
		<div
			className={cn(
				"flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-8 text-center",
				className,
			)}
		>
			<div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6">
				{icon}
			</div>
			<div className="space-y-1">
				<h2 className="font-medium text-lg">{title}</h2>
				<p className="max-w-sm text-muted-foreground text-sm">{description}</p>
			</div>
			{action}
		</div>
	);
}
