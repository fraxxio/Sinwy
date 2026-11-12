import type { ComponentProps } from "react";
import { Card } from "#/shared/components/ui/card";
import { cn } from "#/shared/lib/utils";

/** A card inside a `ContentBox` window: hairline border, no glass or shadow. */
export function FlatCard({ className, ...props }: ComponentProps<typeof Card>) {
	return (
		<Card
			className={cn(
				"rounded-md border-border! bg-transparent! shadow-none! backdrop-filter-none",
				className,
			)}
			{...props}
		/>
	);
}
