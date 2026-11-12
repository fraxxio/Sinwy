import type { ReactNode } from "react";

export function PageHeader({
	title,
	description,
	action,
}: {
	title: string;
	description?: string | undefined;
	action?: ReactNode;
}) {
	return (
		<div className="flex min-h-9.5 flex-wrap items-end justify-between gap-x-4 gap-y-3 px-3 pb-0.5">
			<div className="min-w-0 space-y-0.5">
				<h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
				{description && (
					<p className="text-muted-foreground text-sm">{description}</p>
				)}
			</div>
			{action}
		</div>
	);
}
