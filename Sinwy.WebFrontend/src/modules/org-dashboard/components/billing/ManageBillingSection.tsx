import { useMutation } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Button } from "#/shared/components/ui/button";
import { toast } from "#/shared/components/ui/toast";
import { authClient } from "#/shared/lib/auth/auth-client";

export function ManageBillingSection() {
	// on success the auth client navigates the tab to Polar
	const openPortal = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.customer.portal();
			if (error) throw new Error(error.message ?? "Couldn't open Polar");
		},
		onError: (e) =>
			toast.add({
				type: "error",
				title: "Couldn't open billing",
				description: e.message,
			}),
	});

	return (
		<SettingsSection
			id="payment"
			title="Payment and receipts"
			description="Payment method, billing address and receipts for all your subscriptions. Polar lists every organization you pay for, so pick this one there."
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
