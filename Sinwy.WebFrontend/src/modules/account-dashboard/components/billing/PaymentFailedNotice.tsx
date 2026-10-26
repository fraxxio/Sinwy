import { useMutation } from "@tanstack/react-query";
import { ExternalLinkIcon, TriangleAlertIcon } from "lucide-react";
import { openPolarPortal } from "#/modules/account-dashboard/lib/billing-queries";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { usePageRestored } from "#/shared/hooks/use-page-restored";

/** Past due: Polar keeps retrying the charge, and the organizations stay online meanwhile. */
export function PaymentFailedNotice() {
	const openPortal = useMutation({ mutationFn: openPolarPortal });
	usePageRestored(openPortal.reset);

	return (
		<div
			role="alert"
			className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-destructive/10 p-4 text-sm dark:bg-destructive/20"
		>
			<TriangleAlertIcon
				aria-hidden
				className="size-4 shrink-0 text-destructive"
			/>
			<div className="min-w-0 flex-1">
				<p>
					<span className="font-medium">The last payment failed.</span> Polar
					retries it for a while; if it keeps failing, your plan ends and every
					organization you own goes offline. Update your payment method on
					Polar.
				</p>
				{openPortal.isError && (
					<FieldError>{openPortal.error.message}</FieldError>
				)}
			</div>
			<Button
				size="sm"
				disabled={openPortal.isPending || openPortal.isSuccess}
				onClick={() => openPortal.mutate()}
			>
				{openPortal.isPending || openPortal.isSuccess
					? "Opening…"
					: "Update payment method"}
				<ExternalLinkIcon data-icon="inline-end" />
			</Button>
		</div>
	);
}
