import {
	PAGE_TEMPLATE_IDS,
	PAGE_TEMPLATES,
	type PageTemplateId,
} from "@sinwy/shared";
import { CheckIcon, LockIcon } from "lucide-react";
import { useEntitlements } from "#/shared/lib/auth/entitlements";
import { getPlanName, minimumPlanFor } from "#/shared/lib/plans";
import { cn } from "#/shared/lib/utils";

/** Template cards; ones the plan doesn't include show a lock and can't be picked. */
export function TemplatePicker({
	value,
	onChange,
}: {
	value: PageTemplateId | undefined;
	onChange: (templateId: PageTemplateId) => void;
}) {
	const { has } = useEntitlements();

	return (
		<fieldset className="grid gap-3 sm:grid-cols-2">
			<legend className="sr-only">Template</legend>
			{PAGE_TEMPLATE_IDS.map((id) => {
				const template = PAGE_TEMPLATES[id];
				const plan = template.requires && minimumPlanFor(template.requires);
				const locked = !!template.requires && !has(template.requires);
				const selected = value === id;
				return (
					<label
						key={id}
						className={cn(
							"relative grid gap-1 rounded-xl border p-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
							locked
								? "cursor-not-allowed bg-muted/40 text-muted-foreground"
								: "cursor-pointer hover:bg-muted/50",
							selected && "border-primary bg-primary/5",
						)}
					>
						<input
							type="radio"
							name="templateId"
							value={id}
							checked={selected}
							disabled={locked}
							onChange={() => onChange(id)}
							className="sr-only"
						/>
						<span className="flex items-center justify-between gap-2 font-medium">
							{template.label}
							{selected && <CheckIcon className="size-4 text-primary" />}
							{locked && (
								<span className="inline-flex items-center gap-1 font-normal text-xs">
									<LockIcon className="size-3.5" aria-hidden />
									{plan ? getPlanName(plan) : "Not available"}
								</span>
							)}
						</span>
						<span className="text-muted-foreground text-sm">
							{template.description}
						</span>
					</label>
				);
			})}
		</fieldset>
	);
}
