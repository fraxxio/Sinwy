import type { Config, Slot } from "@puckeditor/core";
import { Children, isValidElement, type ReactNode } from "react";
import {
	type CellMap,
	cellPlacement,
	type FreeGridLayout,
	gridStyle,
	resolveCells,
} from "./free-grid-layout";

export type HeadingLevel = "1" | "2" | "3";

export type BuilderComponents = {
	Section: { items: Slot; tone: "plain" | "muted" };
	Heading: { text: string; level: HeadingLevel };
	FreeGrid: { items: Slot; layout: FreeGridLayout };
};

export type BuilderConfig = Config<BuilderComponents>;

const HEADINGS: Record<HeadingLevel, string> = {
	"1": "text-3xl font-heading font-semibold tracking-tight sm:text-4xl",
	"2": "text-2xl font-heading font-semibold tracking-tight",
	"3": "text-xl font-heading font-medium",
};

const TONES = {
	plain: "",
	muted: "bg-muted",
} as const;

/** Wraps each slot child (keyed by its id) in its grid cell. */
function FreeGridCells({
	layout,
	children,
	...rest
}: {
	layout: CellMap | undefined;
	children?: ReactNode;
	className?: string;
}) {
	const items = Children.toArray(children).filter(isValidElement);
	const ids = items.map((child) => String(child.key).replace(/^\.\$/, ""));
	const cells = resolveCells(ids, layout);
	return (
		<div {...rest} style={gridStyle}>
			{items.map((child, index) => {
				const cell = cells[index];
				return (
					<div key={child.key} style={cell && cellPlacement(cell)}>
						{child}
					</div>
				);
			})}
		</div>
	);
}

/** What the storefront renders with; it must stay free of editor-only code. Fields are plain data, and `<Render>` needs the slot ones. */
export const renderConfig: BuilderConfig = {
	components: {
		Section: {
			fields: {
				items: { type: "slot" },
				tone: {
					type: "radio",
					label: "Background",
					options: [
						{ label: "Plain", value: "plain" },
						{ label: "Muted", value: "muted" },
					],
				},
			},
			render: ({ items: Items, tone }) => (
				<section className={`rounded-xl p-6 ${TONES[tone] ?? ""}`}>
					<Items className="grid gap-4" />
				</section>
			),
		},
		Heading: {
			fields: {
				text: { type: "text", label: "Text", contentEditable: true },
				level: {
					type: "select",
					label: "Size",
					options: [
						{ label: "Large", value: "1" },
						{ label: "Medium", value: "2" },
						{ label: "Small", value: "3" },
					],
				},
			},
			render: ({ text, level }) => {
				const safe = level in HEADINGS ? level : "2";
				const Tag = `h${safe}` as const;
				return <Tag className={HEADINGS[safe]}>{text}</Tag>;
			},
		},
		FreeGrid: {
			fields: {
				items: { type: "slot" },
				layout: { type: "custom", render: () => <></> },
			},
			render: ({ items: Items, layout }) => (
				<Items as={FreeGridCells} layout={layout?.desktop} />
			),
		},
	},
	root: {
		render: ({ children }) => <div className="grid gap-6">{children}</div>,
	},
};
