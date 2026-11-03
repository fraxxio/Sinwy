import type { CustomerRebookServiceDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";
import { formatMinorUnits } from "#/shared/lib/money";

export function BookAgainCard({
	services,
}: {
	services: CustomerRebookServiceDto[];
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Book again</CardTitle>
				<CardDescription>Services you booked before</CardDescription>
			</CardHeader>
			<CardContent>
				<ul className="divide-y">
					{services.map((service) => (
						<li key={service.serviceId}>
							<Link
								to="/$organizationSlug/book"
								params={{ organizationSlug: service.organization.slug }}
								search={{ service: service.serviceId }}
								className="flex items-center gap-4 rounded-md py-2 hover:bg-muted/50"
							>
								<span className="min-w-0 flex-1">
									<span className="block truncate font-medium text-sm">
										{service.serviceName}
									</span>
									<span className="block truncate text-muted-foreground text-xs">
										{service.organization.name} · {service.durationMinutes} min
									</span>
								</span>
								<span className="text-sm tabular-nums">
									{formatMinorUnits(service.priceMinor, service.currency)}
								</span>
							</Link>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
