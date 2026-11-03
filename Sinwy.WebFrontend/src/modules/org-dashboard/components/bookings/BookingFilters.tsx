import {
	BOOKING_SORTS,
	BOOKING_STATUSES,
	type BookingSort,
	type BookingStatus,
	type ServiceDto,
} from "@sinwy/shared";
import { ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { BOOKING_STATUS_LABELS } from "#/modules/org-dashboard/components/bookings/BookingStatusBadge";
import type { BookingsSearch } from "#/modules/org-dashboard/lib/booking-search";
import { Button } from "#/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuTrigger,
} from "#/shared/components/ui/dropdown-menu";
import { Input } from "#/shared/components/ui/input";
import { Label } from "#/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/shared/components/ui/select";

type Option = { value: string; label: string };

function MultiSelect<T extends string>({
	label,
	allLabel,
	options,
	value,
	onChange,
}: {
	label: string;
	allLabel: string;
	options: Option[];
	value: T[];
	onChange: (value: T[]) => void;
}) {
	const chosen = options.filter((option) => value.includes(option.value as T));
	const summary =
		chosen.length === 0
			? allLabel
			: chosen.length === 1
				? chosen[0]?.label
				: `${chosen.length} ${label.toLowerCase()}`;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button type="button" variant="outline" aria-label={label}>
						{summary}
						<ChevronDownIcon />
					</Button>
				}
			/>
			<DropdownMenuContent align="start" className="w-fit min-w-48">
				<DropdownMenuGroup>
					{options.map((option) => (
						<DropdownMenuCheckboxItem
							key={option.value}
							checked={value.includes(option.value as T)}
							closeOnClick={false}
							onCheckedChange={(checked) =>
								onChange(
									checked
										? [...value, option.value as T]
										: value.filter((item) => item !== option.value),
								)
							}
						>
							{option.label}
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function ServiceFilter({
	services,
	value,
	onChange,
}: {
	services: Pick<ServiceDto, "id" | "name">[];
	value: string[];
	onChange: (value: string[]) => void;
}) {
	return (
		<MultiSelect
			label="Services"
			allLabel="All services"
			options={services.map(({ id, name }) => ({ value: id, label: name }))}
			value={value}
			onChange={onChange}
		/>
	);
}

const STATUS_OPTIONS = BOOKING_STATUSES.map((status) => ({
	value: status,
	label: BOOKING_STATUS_LABELS[status],
}));

const SORT_LABELS: Record<BookingSort, string> = {
	startsAt: "Soonest first",
	"-startsAt": "Latest first",
	"-createdAt": "Newest booked",
};
const SORT_OPTIONS = BOOKING_SORTS.map((sort) => ({
	value: sort,
	label: SORT_LABELS[sort],
}));

/** Waits for typing to pause before searching, so each keystroke isn't a request. */
function SearchInput({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const [text, setText] = useState(value);
	useEffect(() => setText(value), [value]);
	useEffect(() => {
		if (text.trim() === value) return;
		const timer = setTimeout(() => onChange(text.trim()), 300);
		return () => clearTimeout(timer);
	}, [text, value, onChange]);
	return (
		<div className="relative min-w-56 flex-1">
			<SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				type="search"
				aria-label="Search bookings"
				placeholder="Name, email or phone"
				className="pl-8"
				value={text}
				onChange={(event) => setText(event.target.value)}
			/>
		</div>
	);
}

export type FilterChange = Partial<
	Pick<BookingsSearch, "from" | "to" | "serviceId" | "status" | "q" | "sort">
>;

export function BookingFilters({
	search,
	services,
	onChange,
}: {
	search: BookingsSearch;
	services: Pick<ServiceDto, "id" | "name">[];
	onChange: (change: FilterChange) => void;
}) {
	const filtered =
		!!search.from ||
		!!search.to ||
		search.serviceId.length > 0 ||
		search.status.length > 0 ||
		!!search.q;
	return (
		<div className="flex flex-wrap items-end gap-2">
			<SearchInput
				value={search.q ?? ""}
				onChange={(q) => onChange({ q: q || undefined })}
			/>
			<div className="grid gap-1">
				<Label htmlFor="bookings-from" className="text-xs">
					From
				</Label>
				<Input
					id="bookings-from"
					type="date"
					className="w-40"
					value={search.from ?? ""}
					max={search.to}
					onChange={(event) =>
						onChange({ from: event.target.value || undefined })
					}
				/>
			</div>
			<div className="grid gap-1">
				<Label htmlFor="bookings-to" className="text-xs">
					To
				</Label>
				<Input
					id="bookings-to"
					type="date"
					className="w-40"
					value={search.to ?? ""}
					min={search.from}
					onChange={(event) =>
						onChange({ to: event.target.value || undefined })
					}
				/>
			</div>
			<ServiceFilter
				services={services}
				value={search.serviceId}
				onChange={(serviceId) => onChange({ serviceId })}
			/>
			<MultiSelect<BookingStatus>
				label="Statuses"
				allLabel="All but cancelled"
				options={STATUS_OPTIONS}
				value={search.status}
				onChange={(status) => onChange({ status })}
			/>
			<Select
				items={SORT_OPTIONS}
				value={search.sort}
				onValueChange={(sort) => sort && onChange({ sort })}
			>
				<SelectTrigger aria-label="Sort" className="w-40">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{SORT_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{filtered && (
				<Button
					type="button"
					variant="ghost"
					onClick={() =>
						onChange({
							from: undefined,
							to: undefined,
							serviceId: [],
							status: [],
							q: undefined,
						})
					}
				>
					<XIcon />
					Clear filters
				</Button>
			)}
		</div>
	);
}
