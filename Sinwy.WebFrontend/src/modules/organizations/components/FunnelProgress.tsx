import { FUNNEL_STEP_ORDER, type FunnelStep } from "@sinwy/shared";
import { CheckIcon } from "lucide-react";
import { FUNNEL_STEPS } from "#/modules/organizations/lib/funnel";
import { cn } from "#/shared/lib/utils";

/**
 * Steps are not links: going back to `create` would start a second
 * organization, and `pay` only opens from a plan choice.
 */
export function FunnelProgress({
	current,
	className,
}: {
	current: FunnelStep;
	className?: string;
}) {
	const currentIndex = FUNNEL_STEP_ORDER.indexOf(current);

	return (
		<ol
			className={cn("flex items-center gap-2", className)}
			aria-label="Setup progress"
		>
			{FUNNEL_STEP_ORDER.map((step, index) => {
				const done = index < currentIndex;
				const active = index === currentIndex;

				return (
					<li
						key={step}
						className="flex items-center gap-2"
						aria-current={active ? "step" : undefined}
					>
						<span
							className={cn(
								"flex size-6 items-center justify-center rounded-full border text-xs font-medium",
								done && "border-primary bg-primary text-primary-foreground",
								active && "border-primary text-primary",
								!done && !active && "border-border text-muted-foreground",
							)}
						>
							{done ? (
								<CheckIcon className="size-3.5" aria-hidden />
							) : (
								index + 1
							)}
						</span>
						<span
							className={cn(
								"text-sm",
								active
									? "font-medium text-foreground"
									: "text-muted-foreground",
							)}
						>
							{FUNNEL_STEPS[step].label}
						</span>
						{index < FUNNEL_STEP_ORDER.length - 1 && (
							<span
								className={cn(
									"ml-1 h-px w-6 sm:w-10",
									done ? "bg-primary" : "bg-border",
								)}
								aria-hidden
							/>
						)}
					</li>
				);
			})}
		</ol>
	);
}
