import {
	AutoField,
	type CustomField,
	createUsePuck,
	FieldLabel,
} from "@puckeditor/core";
import { MonitorIcon, SmartphoneIcon, TabletIcon } from "lucide-react";
import {
	asResponsive,
	BREAKPOINT_LABELS,
	type Breakpoint,
	breakpointForWidth,
	inheritsFrom,
	type Responsive,
	resolveResponsive,
	responsiveOptions,
} from "./responsive";

const usePuck = createUsePuck();

const ICONS: Record<Breakpoint, typeof MonitorIcon> = {
	base: MonitorIcon,
	tablet: TabletIcon,
	mobile: SmartphoneIcon,
};

/** The breakpoint being edited follows Puck's viewport switcher. */
export const useEditedBreakpoint = () =>
	breakpointForWidth(usePuck((s) => s.appState.ui.viewports.current.width));

/** Edits the value for the breakpoint of the current preview size; narrower sizes follow wider ones until set. */
export function ResponsiveField({
	field,
	value,
	onChange,
	readOnly,
}: {
	field: CustomField<unknown>;
	value: unknown;
	onChange: (value: Responsive<string>) => void;
	readOnly?: boolean | undefined;
}) {
	const breakpoint = useEditedBreakpoint();
	const { options, fallback } = responsiveOptions(field) ?? {
		options: [],
		fallback: "",
	};
	const allowed = options.map((option) => option.value);
	const stored = asResponsive(value, allowed, fallback);
	const effective = resolveResponsive(value, allowed, fallback)[breakpoint];
	const own = breakpoint !== "base" ? stored[breakpoint] : undefined;
	const Icon = ICONS[breakpoint];

	const set = (next: string | undefined) => {
		const { [breakpoint]: _, ...rest } = stored;
		onChange(
			(next === undefined
				? rest
				: { ...stored, [breakpoint]: next }) as Responsive<string>,
		);
	};

	return (
		<FieldLabel
			label={field.label ?? ""}
			readOnly={readOnly ?? false}
			el="div"
			endIcon={
				<span
					className="inline-flex items-center gap-1 text-muted-foreground text-xs"
					title={`Editing the ${BREAKPOINT_LABELS[breakpoint].toLowerCase()} value. Switch the preview size to edit another.`}
				>
					<Icon className="size-3.5" />
					{BREAKPOINT_LABELS[breakpoint]}
				</span>
			}
		>
			<AutoField
				field={{
					type: options.length > 3 ? "select" : "radio",
					options: [...options],
				}}
				value={effective}
				onChange={(next) => set(String(next))}
				readOnly={readOnly ?? false}
			/>
			{breakpoint !== "base" && (
				<p className="mt-1.5 flex items-center justify-between gap-2 text-muted-foreground text-xs">
					{own === undefined ? (
						<span>
							Same as{" "}
							{BREAKPOINT_LABELS[inheritsFrom(breakpoint)].toLowerCase()}
						</span>
					) : (
						<>
							<span>Only on {BREAKPOINT_LABELS[breakpoint].toLowerCase()}</span>
							<button
								type="button"
								className="font-medium text-foreground underline underline-offset-2"
								onClick={() => set(undefined)}
							>
								Reset
							</button>
						</>
					)}
				</p>
			)}
		</FieldLabel>
	);
}
