import type { ReactNode } from "react";
import { cn } from "#/shared/lib/utils";

export function ContentBox({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex flex-1 flex-col rounded-lg border bg-card p-6 text-card-foreground",
				className,
			)}
		>
			{children}
		</div>
	);
}
