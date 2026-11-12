import type { PaymentTotalsDto } from "@sinwy/shared";
import { FlatCard } from "#/shared/components/FlatCard";
import { CardContent } from "#/shared/components/ui/card";
import { formatMinorUnits } from "#/shared/lib/money";

/** One card per currency in the range; `void` payments are already left out. */
export function PaymentTotals({ totals }: { totals: PaymentTotalsDto[] }) {
	if (totals.length === 0) return null;
	return (
		<div className="@container">
			<div className="grid @2xl:grid-cols-2 @5xl:grid-cols-3 gap-3">
				{totals.map((total) => (
					<FlatCard key={total.currency} size="sm">
						<CardContent className="grid grid-cols-3 gap-3">
							<Figure
								label="Collected"
								value={formatMinorUnits(total.paidMinor, total.currency)}
							/>
							<Figure
								label="Outstanding"
								value={formatMinorUnits(total.pendingMinor, total.currency)}
							/>
							<Figure label="Payments" value={String(total.count)} />
						</CardContent>
					</FlatCard>
				))}
			</div>
		</div>
	);
}

function Figure({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-muted-foreground text-xs">{label}</div>
			<div className="font-semibold text-lg tabular-nums">{value}</div>
		</div>
	);
}
