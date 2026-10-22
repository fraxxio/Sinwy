import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "#/shared/components/ui/button";
import { usePermissions } from "#/shared/lib/auth/permissions";

export function InactiveOrganizationBanner({
	organizationId,
}: {
	organizationId: string;
}) {
	const { can } = usePermissions();
	const canRenew = can("billing:manage");

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm dark:bg-destructive/20">
			<TriangleAlertIcon
				aria-hidden
				className="size-4 shrink-0 text-destructive"
			/>
			<p className="min-w-0 flex-1">
				<span className="font-medium">
					This organization has no active plan.
				</span>{" "}
				Data is kept but changes are paused.
				{!canRenew && " Ask an owner to renew the subscription."}
			</p>
			{canRenew && (
				<Button
					size="sm"
					nativeButton={false}
					render={
						<Link
							to="/organizations/$id/plan"
							params={{ id: organizationId }}
							search={{ intent: "renew" }}
						/>
					}
				>
					Choose a plan
				</Button>
			)}
		</div>
	);
}
