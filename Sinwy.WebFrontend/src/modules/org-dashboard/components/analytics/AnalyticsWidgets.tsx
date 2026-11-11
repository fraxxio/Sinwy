import { format, parseISO } from "date-fns";
import type { ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { FlatCard } from "#/shared/components/FlatCard";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "#/shared/components/ui/chart";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/shared/components/ui/table";

export const formatCount = (value: number) => value.toLocaleString();

/** A 0–1 fraction as "12.5%"; "—" when there was nothing to divide by. */
export const formatRate = (rate: number | null) =>
	rate === null
		? "—"
		: rate.toLocaleString(undefined, {
				style: "percent",
				maximumFractionDigits: 1,
			});

export function StatCard({
	title,
	value,
	hint,
}: {
	title: string;
	value: ReactNode;
	hint?: ReactNode;
}) {
	return (
		<FlatCard size="sm">
			<CardHeader>
				<CardDescription>{title}</CardDescription>
				<CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
			</CardHeader>
			{hint && (
				<CardContent className="text-muted-foreground text-xs">
					{hint}
				</CardContent>
			)}
		</FlatCard>
	);
}

const formatDay = (date: string) => format(parseISO(date), "MMM d");

/** One area per key of `config`, over the days of the range. */
export function SeriesChart<K extends string>({
	title,
	description,
	data,
	config,
	formatValue = formatCount,
}: {
	title: string;
	description?: string;
	data: NoInfer<Record<K, number> & { date: string }>[];
	config: ChartConfig & Record<K, { label: string; color: string }>;
	formatValue?: (value: number) => string;
}) {
	const keys = Object.keys(config) as K[];

	return (
		<FlatCard>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent>
				<ChartContainer config={config} className="aspect-auto h-64 w-full">
					<AreaChart data={data} margin={{ left: 0, right: 8 }}>
						<CartesianGrid vertical={false} />
						<XAxis
							dataKey="date"
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							minTickGap={24}
							tickFormatter={formatDay}
						/>
						<YAxis
							tickLine={false}
							axisLine={false}
							width="auto"
							allowDecimals={false}
							tickFormatter={(value: number) => formatValue(value)}
						/>
						<ChartTooltip
							content={
								<ChartTooltipContent
									labelFormatter={(date) => formatDay(String(date))}
									formatter={(value, name) => (
										<div className="flex flex-1 justify-between gap-4">
											<span className="text-muted-foreground">
												{config[name as K]?.label ?? name}
											</span>
											<span className="font-medium font-mono tabular-nums">
												{formatValue(Number(value))}
											</span>
										</div>
									)}
								/>
							}
						/>
						{keys.map((key) => (
							<Area
								key={key}
								dataKey={key}
								type="linear"
								fill={`var(--color-${key})`}
								fillOpacity={0.2}
								stroke={`var(--color-${key})`}
								strokeWidth={2}
							/>
						))}
					</AreaChart>
				</ChartContainer>
			</CardContent>
		</FlatCard>
	);
}

/** A small titled table of counts; `rows` is already sorted. */
export function BreakdownTable({
	title,
	columns,
	rows,
	empty,
}: {
	title: string;
	columns: [string, ...string[]];
	rows: { key: string; cells: [ReactNode, ...ReactNode[]] }[];
	empty: string;
}) {
	return (
		<FlatCard size="sm">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<p className="text-muted-foreground text-sm">{empty}</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								{columns.map((column, index) => (
									<TableHead
										key={column}
										className={index > 0 ? "text-right" : undefined}
									>
										{column}
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.key}>
									{row.cells.map((cell, index) => (
										<TableCell
											// biome-ignore lint/suspicious/noArrayIndexKey: columns are fixed
											key={index}
											className={
												index > 0
													? "text-right tabular-nums"
													: "max-w-64 truncate"
											}
										>
											{cell}
										</TableCell>
									))}
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</FlatCard>
	);
}
