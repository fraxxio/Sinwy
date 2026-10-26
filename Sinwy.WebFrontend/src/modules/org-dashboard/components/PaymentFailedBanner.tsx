import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "#/shared/components/ui/button";

/** For the owner only: their plan is past due while Polar retries the charge. */
export function PaymentFailedBanner() {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm dark:bg-destructive/20">
			<TriangleAlertIcon
				aria-hidden
				className="size-4 shrink-0 text-destructive"
			/>
			<p className="min-w-0 flex-1">
				<span className="font-medium">
					The last payment for your plan failed.
				</span>{" "}
				Update your payment method to keep your organizations online.
			</p>
			<Button
				size="sm"
				nativeButton={false}
				render={<Link to="/account/billing" />}
			>
				Go to billing
			</Button>
		</div>
	);
}
