import type { Overrides } from "@puckeditor/core";
import { LockIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Input } from "#/shared/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/shared/components/ui/select";
import { Textarea } from "#/shared/components/ui/textarea";
import { cn } from "#/shared/lib/utils";

type Option = { label: string; value: unknown };

export function EditorFieldLabel({
	label,
	icon,
	endIcon,
	readOnly,
	el = "label",
	htmlFor,
	className,
	children,
}: {
	label: string;
	icon?: ReactNode;
	endIcon?: ReactNode;
	readOnly?: boolean | undefined;
	el?: "label" | "div";
	htmlFor?: string | undefined;
	className?: string | undefined;
	children?: ReactNode;
}) {
	const Tag = el;
	return (
		<div className={cn("grid gap-2", className)}>
			{label && (
				<span className="flex items-center gap-1.5 font-medium text-foreground text-sm">
					{icon}
					{Tag === "label" ? <label htmlFor={htmlFor}>{label}</label> : label}
					{readOnly && (
						<LockIcon
							aria-label="Locked"
							className="size-3.5 text-muted-foreground"
						/>
					)}
					{endIcon && <span className="ml-auto">{endIcon}</span>}
				</span>
			)}
			{children}
		</div>
	);
}

/** Options are matched by their string form, so `select` values saved as strings (`"2"`) still resolve. */
const indexOf = (options: readonly Option[], value: unknown) =>
	options.findIndex((option) => String(option.value) === String(value));

export function SelectControl({
	id,
	options,
	value,
	onChange,
	readOnly,
}: {
	id?: string | undefined;
	options: readonly Option[];
	value: unknown;
	onChange: (value: unknown) => void;
	readOnly?: boolean | undefined;
}) {
	const items = options.map((option, index) => ({
		label: option.label,
		value: String(index),
	}));
	const selected = indexOf(options, value);
	return (
		<Select
			id={id}
			items={items}
			value={selected === -1 ? null : String(selected)}
			disabled={readOnly}
			onValueChange={(next) => {
				if (next !== null) onChange(options[Number(next)]?.value);
			}}
		>
			<SelectTrigger size="sm">
				<SelectValue placeholder="Choose" />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{items.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

/** Native radios styled as a segmented control: every option stays visible and arrow keys move between them. */
export function Segmented<T>({
	label,
	options,
	selected,
	onSelect,
	disabled,
	className,
}: {
	label: string;
	options: readonly {
		key: string;
		value: T;
		content: ReactNode;
		title?: string;
	}[];
	selected: number;
	onSelect: (value: T) => void;
	disabled?: boolean | undefined;
	className?: string;
}) {
	const name = useId();
	return (
		<fieldset
			aria-label={label}
			disabled={disabled}
			className={cn(
				"flex rounded-lg border border-(--line-soft) bg-muted/60 p-0.5 disabled:opacity-50",
				className,
			)}
		>
			{options.map((option, index) => (
				<label
					key={option.key}
					title={option.title}
					className={cn(
						"grid h-7 flex-1 cursor-pointer place-content-center rounded-md px-2 font-medium text-muted-foreground text-xs transition-colors",
						"hover:text-foreground has-checked:bg-card has-checked:text-foreground has-checked:shadow-xs",
						"has-focus-visible:ring-2 has-focus-visible:ring-ring/40",
					)}
				>
					<input
						type="radio"
						name={name}
						className="sr-only"
						checked={index === selected}
						onChange={() => onSelect(option.value)}
					/>
					{option.content}
				</label>
			))}
		</fieldset>
	);
}

export function RadioControl({
	label,
	options,
	value,
	onChange,
	readOnly,
}: {
	label: string;
	options: readonly Option[];
	value: unknown;
	onChange: (value: unknown) => void;
	readOnly?: boolean | undefined;
}) {
	return (
		<Segmented
			label={label}
			options={options.map((option) => ({
				key: String(option.value),
				value: option.value,
				content: option.label,
			}))}
			selected={indexOf(options, value)}
			onSelect={onChange}
			disabled={readOnly}
			className="w-full"
		/>
	);
}

const placeholderOf = (field: object) =>
	"placeholder" in field && typeof field.placeholder === "string"
		? field.placeholder
		: undefined;

const optionsOf = (field: object): readonly Option[] =>
	"options" in field && Array.isArray(field.options) ? field.options : [];

/** Puck's built-in inputs for the common field types, swapped for ours. Rich text, slots and custom fields stay Puck's. */
export const fieldOverrides: Partial<Overrides> = {
	fieldLabel: ({ label, icon, endIcon, readOnly, el, className, children }) => (
		<EditorFieldLabel
			label={label}
			icon={icon}
			endIcon={endIcon}
			readOnly={readOnly}
			el={el ?? "label"}
			className={className}
		>
			{children}
		</EditorFieldLabel>
	),
	fieldTypes: {
		text: ({ field, id, name, value, onChange, readOnly }) => (
			<EditorFieldLabel
				label={field.label ?? name}
				htmlFor={id}
				readOnly={readOnly}
			>
				<Input
					id={id}
					name={name}
					value={(value as string | undefined) ?? ""}
					placeholder={placeholderOf(field)}
					readOnly={readOnly}
					onChange={(event) => onChange(event.currentTarget.value)}
					className="h-8"
				/>
			</EditorFieldLabel>
		),
		textarea: ({ field, id, name, value, onChange, readOnly }) => (
			<EditorFieldLabel
				label={field.label ?? name}
				htmlFor={id}
				readOnly={readOnly}
			>
				<Textarea
					id={id}
					name={name}
					value={(value as string | undefined) ?? ""}
					placeholder={placeholderOf(field)}
					readOnly={readOnly}
					onChange={(event) => onChange(event.currentTarget.value)}
				/>
			</EditorFieldLabel>
		),
		select: ({ field, id, name, value, onChange, readOnly }) => (
			<EditorFieldLabel
				label={field.label ?? name}
				el="div"
				readOnly={readOnly}
			>
				<SelectControl
					id={id}
					options={optionsOf(field)}
					value={value}
					onChange={onChange}
					readOnly={readOnly}
				/>
			</EditorFieldLabel>
		),
		radio: ({ field, name, value, onChange, readOnly }) => (
			<EditorFieldLabel
				label={field.label ?? name}
				el="div"
				readOnly={readOnly}
			>
				<RadioControl
					label={field.label ?? name}
					options={optionsOf(field)}
					value={value}
					onChange={onChange}
					readOnly={readOnly}
				/>
			</EditorFieldLabel>
		),
	},
};
