import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription } from "#/shared/components/ui/alert";

const COPY = {
	organization:
		"Online payments aren't set up yet. Sinwy doesn't charge your customers. Each booking with a price is listed here as pending. Mark it as paid once you've taken payment at your business.",
	customer:
		"Payments aren't taken online yet. You pay the business directly. This page lists what's due and what the business has marked as paid.",
} as const;

export function PaymentsNotice({ audience }: { audience: keyof typeof COPY }) {
	return (
		<Alert role="note" className="rounded-md print:hidden">
			<InfoIcon />
			<AlertDescription>{COPY[audience]}</AlertDescription>
		</Alert>
	);
}
