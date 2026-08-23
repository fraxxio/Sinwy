import type * as React from "react";

import { cn } from "@/shared/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"input-well field-sizing-content min-h-24 w-full resize-none rounded-md border border-(--line-soft) bg-card bg-clip-padding px-3.5 py-2.5 text-base text-foreground transition-[box-shadow,border-color,background-color] duration-150 ease-glide outline-none dark:bg-background/50",
				"placeholder:text-muted-foreground",
				"hover:border-[color-mix(in_oklab,var(--ring)_28%,var(--line-soft))]",
				"focus-visible:border-ring focus-visible:[--input-ring:color-mix(in_oklab,var(--ring)_28%,transparent)]",
				"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				"aria-invalid:border-destructive aria-invalid:focus-visible:[--input-ring:color-mix(in_oklab,var(--destructive)_22%,transparent)] dark:aria-invalid:border-destructive/60",
				"data-valid:border-success",
				"md:text-sm",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
