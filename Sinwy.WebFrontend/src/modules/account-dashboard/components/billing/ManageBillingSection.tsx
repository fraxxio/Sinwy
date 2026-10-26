import { useMutation } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { openPolarPortal } from "#/modules/account-dashboard/lib/billing-queries";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Button } from "#/shared/components/ui/button";
import { toast } from "#/shared/components/ui/toast";
import { usePageRestored } from "#/shared/hooks/use-page-restored";

export function ManageBillingSection() {
	const openPortal = useMutation({
		mutationFn: openPolarPortal,
		onError: (e) =>
			toast.add({
				type: "error",
				title: "Couldn't open billing",
				description: e.message,
			}),
	});
	usePageRestored(openPortal.reset);

	return (
		<SettingsSection
			id="payment"
			title="Payment and receipts"
			description="Payment method, billing address and receipts for your plan."
			action={
				<Button
					type="button"
					variant="outline"
					size="sm"
					// stays pending through the redirect so it can't be clicked twice
					disabled={openPortal.isPending || openPortal.isSuccess}
					onClick={() => openPortal.mutate()}
				>
					{openPortal.isPending || openPortal.isSuccess
						? "Opening…"
						: "Manage billing on Polar"}
					<ExternalLinkIcon data-icon="inline-end" />
				</Button>
			}
		/>
	);
}
