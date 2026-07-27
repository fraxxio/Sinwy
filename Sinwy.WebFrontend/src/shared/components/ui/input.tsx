import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "@/shared/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<InputPrimitive
			type={type}
			data-slot="input"
			className={cn(
				"input-well h-10 w-full min-w-0 rounded-md border border-(--line-soft) bg-card bg-clip-padding px-3.5 py-1 text-base text-foreground transition-[box-shadow,border-color,background-color] duration-150 ease-glide outline-none dark:bg-background/50",
				"file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground",
				"hover:border-[color-mix(in_oklab,var(--ring)_28%,var(--line-soft))]",
				"focus-visible:border-ring focus-visible:[--input-ring:color-mix(in_oklab,var(--ring)_28%,transparent)]",
				"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				"aria-invalid:border-destructive aria-invalid:[--input-ring:color-mix(in_oklab,var(--destructive)_22%,transparent)] dark:aria-invalid:border-destructive/60",
				"md:text-sm",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
