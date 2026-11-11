import type { BookingOverviewDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FlatCard } from "#/shared/components/FlatCard";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";
import { formatMinorUnits } from "#/shared/lib/money";

function Stat({
	title,
	value,
	children,
}: {
	title: string;
	value: ReactNode;
	children?: ReactNode;
}) {
	return (
		<FlatCard>
			<CardHeader>
				<CardDescription>{title}</CardDescription>
				<CardTitle className="text-2xl">{value}</CardTitle>
			</CardHeader>
			{children && (
				<CardContent className="text-muted-foreground text-sm">
					{children}
				</CardContent>
			)}
		</FlatCard>
	);
}

const plural = (count: number, one: string, many: string) =>
	`${count} ${count === 1 ? one : many}`;

export function OverviewStats({
	organizationSlug,
	overview,
}: {
	organizationSlug: string;
	overview: BookingOverviewDto;
}) {
	const { revenue, pending, occupancy, needsAttention, currency, today } =
		overview;
	const attention = needsAttention.unresolved + needsAttention.expiredRequests;
	const listLink = (status: "confirmed" | "pending", label: string) => (
		<Link
			to="/dashboard/$organizationSlug/bookings"
			params={{ organizationSlug }}
			search={{ view: "list", status: [status], to: today }}
			className="block underline-offset-4 hover:text-foreground hover:underline"
		>
			{label}
		</Link>
	);

	return (
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<Stat
				title="Booked this week"
				value={formatMinorUnits(revenue.bookedMinor, currency)}
			>
				{formatMinorUnits(revenue.completedMinor, currency)} from completed
			</Stat>
			<Stat title="Pending requests" value={pending.total}>
				{pending.total === 0 ? "All caught up" : "Waiting for your answer"}
			</Stat>
			<Stat
				title="Occupancy this week"
				value={occupancy.percent === null ? "—" : `${occupancy.percent}%`}
			>
				{occupancy.percent === null ? (
					<Link
						to="/dashboard/$organizationSlug/services/hours"
						params={{ organizationSlug }}
						className="underline underline-offset-4 hover:text-foreground"
					>
						Set your business hours
					</Link>
				) : (
					`${occupancy.bookedMinutes.toLocaleString()} of ${occupancy.openMinutes.toLocaleString()} open minutes`
				)}
			</Stat>
			<Stat title="Needs attention" value={attention}>
				{attention === 0 && "Nothing to follow up"}
				{needsAttention.unresolved > 0 &&
					listLink(
						"confirmed",
						plural(
							needsAttention.unresolved,
							"booking without an outcome",
							"bookings without an outcome",
						),
					)}
				{needsAttention.expiredRequests > 0 &&
					listLink(
						"pending",
						plural(
							needsAttention.expiredRequests,
							"expired request",
							"expired requests",
						),
					)}
			</Stat>
		</div>
	);
}
