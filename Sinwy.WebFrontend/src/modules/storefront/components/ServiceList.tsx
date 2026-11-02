import type { PublicServiceDto } from "@sinwy/shared";
import { CalendarXIcon, ChevronRightIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { Badge } from "#/shared/components/ui/badge";
import { formatMinorUnits } from "#/shared/lib/money";

export function ServiceList({
	services,
	onPick,
}: {
	services: PublicServiceDto[];
	onPick: (serviceId: string) => void;
}) {
	if (services.length === 0)
		return (
			<EmptyState
				icon={<CalendarXIcon />}
				title="No services to book yet"
				description="This business hasn't listed any services. Check back later."
			/>
		);

	return (
		<ul className="divide-y rounded-xl border bg-card">
			{services.map((service) => (
				<li key={service.id}>
					<button
						type="button"
						className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/60"
						onClick={() => onPick(service.id)}
					>
						<div className="min-w-0 flex-1 space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium">{service.name}</span>
								{service.requiresApproval && (
									<Badge variant="secondary">Needs confirmation</Badge>
								)}
							</div>
							{service.description && (
								<p className="line-clamp-2 text-muted-foreground text-sm">
									{service.description}
								</p>
							)}
							<p className="text-muted-foreground text-sm">
								{service.durationMinutes} min
							</p>
						</div>
						<span className="font-medium">
							{formatMinorUnits(service.priceMinor, service.currency)}
						</span>
						<ChevronRightIcon className="size-4 text-muted-foreground" />
					</button>
				</li>
			))}
		</ul>
	);
}
