import type { ReactNode } from "react";

export function SettingsSection({
	id,
	title,
	description,
	action,
	children,
}: {
	id: string;
	title: string;
	description: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section id={id} className="grid max-w-3xl gap-4 py-8 first:pt-0 last:pb-0">
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h2 className="font-heading font-medium text-base">{title}</h2>
					<p className="text-muted-foreground text-sm">{description}</p>
				</div>
				{action}
			</div>
			{children}
		</section>
	);
}
