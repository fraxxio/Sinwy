import type { Config, Slot } from "@puckeditor/core";

export type HeadingLevel = "1" | "2" | "3";

export type BuilderComponents = {
	Section: { items: Slot; tone: "plain" | "muted" };
	Heading: { text: string; level: HeadingLevel };
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
	},
	root: {
		render: ({ children }) => <div className="grid gap-6">{children}</div>,
	},
};
