import { AutoField, type Field, type Overrides } from "@puckeditor/core";
import type { PublicServiceDto } from "@sinwy/shared";
import { LockIcon } from "lucide-react";
import { createContext, type ReactNode, use, useId } from "react";
import type { CustomFieldUi } from "#/shared/components/page-builder/puck-config";
import { Checkbox } from "#/shared/components/ui/checkbox";
import { Input } from "#/shared/components/ui/input";
import { Label } from "#/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/shared/components/ui/select";
import { cn } from "#/shared/lib/utils";

/** The org's active services, in their order; Puck doesn't pass `metadata` to fields. */
export const EditorServicesContext = createContext<readonly PublicServiceDto[]>(
	[],
);

type Option = { label: string; value: unknown };

const optionsOf = (field: object): readonly Option[] =>
	"options" in field && Array.isArray(field.options) ? field.options : [];

function FieldHeading({
	label,
	htmlFor,
	readOnly,
}: {
	label: string;
	htmlFor?: string | undefined;
	readOnly?: boolean | undefined;
}) {
	const lock = readOnly && (
		<LockIcon aria-label="Locked" className="size-3.5 text-muted-foreground" />
	);
	return htmlFor ? (
		<Label htmlFor={htmlFor}>
			{label}
			{lock}
		</Label>
	) : (
		<span className="flex items-center gap-2 font-medium text-sm leading-none">
			{label}
			{lock}
		</span>
	);
}

function EditorField({
	label,
	htmlFor,
	readOnly,
	className,
	children,
}: {
	label: string;
	htmlFor?: string | undefined;
	readOnly?: boolean | undefined;
	className?: string | undefined;
	children?: ReactNode;
}) {
	return (
		<div className={cn("grid gap-2", className)}>
			{label && (
				<FieldHeading label={label} htmlFor={htmlFor} readOnly={readOnly} />
			)}
			{children}
		</div>
	);
}

/** Native radios styled as a segmented control, so every option stays visible and arrow keys move between them. */
function Segmented({
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
	const name = useId();
	return (
		<fieldset
			aria-label={label}
			disabled={readOnly}
			className="flex rounded-lg border border-(--line-soft) bg-muted/60 p-0.5 disabled:opacity-50"
		>
			{options.map((option) => (
				<label
					key={String(option.value)}
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
						checked={String(option.value) === String(value)}
						onChange={() => onChange(option.value)}
					/>
					{option.label}
				</label>
			))}
		</fieldset>
	);
}

/** Our inputs in place of Puck's for the field types the manifest uses; rich text keeps Puck's editor. */
export const fieldOverrides: Partial<Overrides> = {
	fieldLabel: ({ label, readOnly, className, children }) => (
		<EditorField label={label} readOnly={readOnly} className={className}>
			{children}
		</EditorField>
	),
	fieldTypes: {
		text: ({ field, id, name, value, onChange, readOnly }) => (
			<EditorField label={field.label ?? name} htmlFor={id} readOnly={readOnly}>
				<Input
					id={id}
					name={name}
					value={typeof value === "string" ? value : ""}
					readOnly={readOnly}
					className={cn(readOnly && "bg-muted/60 text-muted-foreground")}
					onChange={(event) => onChange(event.currentTarget.value)}
				/>
			</EditorField>
		),
		select: ({ field, id, name, value, onChange, readOnly }) => {
			const items = optionsOf(field).map((option) => ({
				label: option.label,
				value: String(option.value),
			}));
			return (
				<EditorField label={field.label ?? name} readOnly={readOnly}>
					<Select
						id={id}
						items={items}
						value={value === undefined ? null : String(value)}
						disabled={readOnly}
						onValueChange={(next) => {
							if (next !== null) onChange(next);
						}}
					>
						<SelectTrigger aria-label={field.label ?? name} className="w-full">
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
				</EditorField>
			);
		},
		radio: ({ field, name, value, onChange, readOnly }) => (
			<EditorField label={field.label ?? name} readOnly={readOnly}>
				<Segmented
					label={field.label ?? name}
					options={optionsOf(field)}
					value={value}
					onChange={onChange}
					readOnly={readOnly}
				/>
			</EditorField>
		),
	},
};

function ServiceChecklist({
	label,
	value,
	onChange,
	readOnly,
}: {
	label: string;
	value: unknown;
	onChange: (value: string[]) => void;
	readOnly?: boolean | undefined;
}) {
	const services = use(EditorServicesContext);
	const ids = Array.isArray(value) ? (value as string[]) : [];
	const all = ids.length === 0;
	const isShown = (id: string) => all || ids.includes(id);
	const shownCount = services.filter((service) => isShown(service.id)).length;
	const choose = (shown: (id: string) => boolean) => {
		const chosen = services.filter((s) => shown(s.id)).map((s) => s.id);
		onChange(chosen.length === services.length ? [] : chosen);
	};

	return (
		<EditorField label={label} readOnly={readOnly}>
			{services.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					You have no active services yet. Once you add some, they show up here.
				</p>
			) : (
				<div className="grid gap-2.5">
					<Label className="font-normal">
						<Checkbox
							checked={all}
							disabled={readOnly || all}
							onCheckedChange={(checked) => {
								if (checked) onChange([]);
							}}
						/>
						All services
					</Label>
					<div className="grid gap-2.5 border-(--line-soft) border-l pl-3">
						{services.map((service) => {
							const shown = isShown(service.id);
							return (
								<Label key={service.id} className="font-normal">
									<Checkbox
										checked={shown}
										disabled={readOnly || (shown && shownCount === 1)}
										onCheckedChange={(checked) =>
											choose((id) =>
												id === service.id ? checked : isShown(id),
											)
										}
									/>
									{service.name}
								</Label>
							);
						})}
					</div>
					<p className="text-muted-foreground text-xs">
						With all services ticked, new ones appear on the page too.
					</p>
				</div>
			)}
		</EditorField>
	);
}

export const serviceIdsField: CustomFieldUi = {
	type: "custom",
	render: ({ field, name, value, onChange, readOnly }) => (
		<ServiceChecklist
			label={field.label ?? name}
			value={value}
			onChange={onChange}
			readOnly={readOnly}
		/>
	),
};

/** A field the manifest marks locked, shown read-only through our usual control. */
export const lockedField = (field: Field): Field => ({
	type: "custom",
	...(field.label !== undefined && { label: field.label }),
	...(field.metadata && { metadata: field.metadata }),
	render: ({ id, value, onChange }) => (
		<div className="grid">
			<AutoField
				field={field}
				id={id}
				value={value}
				onChange={onChange}
				readOnly
			/>
			<p className="mt-1.5 text-muted-foreground text-xs">
				This setting is part of the block and can't be changed.
			</p>
		</div>
	),
});

const noop = () => {};

/**
 * Puck loads its rich-text editor lazily and, until it arrives, shows a stand-in that drops typed keys and loses
 * focus when replaced. Mounting one hidden copy with the editor starts that load before a Text block is selected.
 */
export const PreloadRichText = () => (
	<div hidden inert>
		<AutoField
			field={{ type: "richtext" }}
			id="preload-rich-text"
			value=""
			onChange={noop}
			readOnly
		/>
	</div>
);
