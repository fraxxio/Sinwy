import type { ReactNode } from "react";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";

export function SettingsSection({
	id,
	title,
	description,
	action,
	className,
	children,
}: {
	id: string;
	title: string;
	description: string;
	action?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<Card id={id} className={className}>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
				{action && <CardAction>{action}</CardAction>}
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}
