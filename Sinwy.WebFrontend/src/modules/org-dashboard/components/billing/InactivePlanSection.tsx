import { Link } from "@tanstack/react-router";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";

export function InactivePlanSection({
	organizationId,
}: {
	organizationId: string;
}) {
	return (
		<SettingsSection
			id="plan"
			title="Plan"
			description="What this organization pays for."
			action={
				<Button
					size="sm"
					nativeButton={false}
					render={
						<Link
							to="/organizations/$id/plan"
							params={{ id: organizationId }}
						/>
					}
				>
					Choose a plan
				</Button>
			}
		>
			<div className="grid gap-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium text-lg">No active plan</span>
					<Badge variant="destructive">Inactive</Badge>
				</div>
				<p className="text-muted-foreground text-sm">
					Data is kept but changes are paused until you choose a plan.
				</p>
			</div>
		</SettingsSection>
	);
}
