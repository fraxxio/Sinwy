import type { ReactNode } from "react";

export function PageHeader({
	title,
	description,
	action,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div className="space-y-1 flex items-center gap-4">
				<h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
				{description && (
					<p className="text-muted-foreground text-sm">{description}</p>
				)}
			</div>
			{action}
		</div>
	);
}
