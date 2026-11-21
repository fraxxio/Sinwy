import { z } from "zod";
import type { Feature } from "../../plan";
import { isSafeImageSrc, isSafeLink } from "../PageUrls";
import { normalizeRichText } from "../RichText";

export const PAGE_DOCUMENT_LIMITS = {
	maxDepth: 6,
	maxBlocks: 400,
	maxBytes: 256 * 1024,
	id: 64,
	text: 200,
	richText: 20_000,
	url: 2048,
	serviceIds: 50,
} as const;

/** A stored block: `props` holds its fields, slots included, and its `id`. */
export type BlockNode = {
	type: string;
	props: { id: string } & Record<string, unknown>;
};

/** A block in a slot's default content; the editor gives it an id when it's added. */
export type BlockTemplate = { type: string; props: Record<string, unknown> };

type FieldMeta = {
	label: string;
	/** Shown read-only in the editor; the server still validates the value. */
	locked?: boolean;
};

type ValueField<Kind extends string, Value> = FieldMeta & {
	kind: Kind;
	default: Value;
	schema: z.ZodType<Value, Value>;
};

export type SelectOption<V extends string = string> = {
	value: V;
	label: string;
};

export type TextField = ValueField<"text", string>;
export type SelectField<V extends string = string> = ValueField<"select", V> & {
	options: readonly SelectOption<V>[];
	/** How the editor shows the options; `radio` suits two or three short ones. */
	display: "select" | "radio";
};
export type RichTextField = ValueField<"richText", string>;
export type LinkField = ValueField<"link", string>;
export type ImageField = ValueField<"image", string>;
export type SlotField = FieldMeta & {
	kind: "slot";
	/** Block types the slot accepts. */
	allow: readonly string[];
	default: readonly BlockTemplate[];
};
/** A field whose editor UI the web app supplies by `kind`. */
export type CustomField<
	Kind extends string = string,
	Value = unknown,
> = ValueField<Kind, Value> & { custom: true };

export type BlockField =
	| TextField
	| SelectField
	| RichTextField
	| LinkField
	| ImageField
	| SlotField
	| CustomField;

export const isSlotField = (f: BlockField): f is SlotField =>
	f.kind === "slot" && !("custom" in f);

const noNul = (value: string) => value.replaceAll("\0", "");

const plainText = (max: number) =>
	z
		.string("must be text")
		.max(max, `is longer than ${max} characters`)
		.transform(noNul);

const url = (isSafe: (value: string) => boolean, message: string) =>
	z
		.string("must be text")
		.max(
			PAGE_DOCUMENT_LIMITS.url,
			`is longer than ${PAGE_DOCUMENT_LIMITS.url} characters`,
		)
		.transform(noNul)
		.refine((value) => value === "" || isSafe(value), message);

type Meta = { label: string; locked?: boolean };

const meta = ({ label, locked }: Meta): FieldMeta =>
	locked ? { label, locked } : { label };

export const field = {
	text: (options: Meta & { default?: string }): TextField => ({
		...meta(options),
		kind: "text",
		default: options.default ?? "",
		schema: plainText(PAGE_DOCUMENT_LIMITS.text),
	}),

	select: <const V extends string>(
		options: Meta & {
			options: readonly [SelectOption<V>, ...SelectOption<V>[]];
			default: NoInfer<V>;
			display?: "select" | "radio";
		},
	): SelectField<V> => {
		const values = options.options.map(({ value }) => value);
		return {
			...meta(options),
			kind: "select",
			default: options.default,
			options: options.options,
			display: options.display ?? "select",
			schema: z.enum(values as [V, ...V[]], {
				error: `must be one of: ${values.join(", ")}`,
			}),
		};
	},

	/** Stored as allowlisted HTML; any HTML is accepted and normalised on save. */
	richText: (options: Meta & { default?: string }): RichTextField => ({
		...meta(options),
		kind: "richText",
		default: options.default ?? "",
		schema: z
			.string("must be text")
			.max(
				PAGE_DOCUMENT_LIMITS.richText,
				`is longer than ${PAGE_DOCUMENT_LIMITS.richText} characters`,
			)
			.transform(normalizeRichText),
	}),

	link: (options: Meta & { default?: string }): LinkField => ({
		...meta(options),
		kind: "link",
		default: options.default ?? "",
		schema: url(isSafeLink, "is not a safe link"),
	}),

	image: (options: Meta & { default?: string }): ImageField => ({
		...meta(options),
		kind: "image",
		default: options.default ?? "",
		schema: url(isSafeImageSrc, "is not a safe image URL"),
	}),

	slot: (options: {
		label?: string;
		allow: readonly string[];
		default?: readonly BlockTemplate[];
	}): SlotField => ({
		label: options.label ?? "",
		kind: "slot",
		allow: options.allow,
		default: options.default ?? [],
	}),

	/** The org's services to list, in order; empty lists them all. */
	serviceIds: (options: Meta): CustomField<"serviceIds", string[]> => ({
		...meta(options),
		kind: "serviceIds",
		custom: true,
		default: [],
		schema: z
			.array(
				z
					.string("must be a list of service ids")
					.min(1, "holds an empty service id")
					.max(PAGE_DOCUMENT_LIMITS.id, "holds a service id that is too long")
					.refine((id) => !id.includes("\0"), "holds an invalid service id"),
				"must be a list of service ids",
			)
			.max(
				PAGE_DOCUMENT_LIMITS.serviceIds,
				`holds more than ${PAGE_DOCUMENT_LIMITS.serviceIds} services`,
			),
	}),
};

type Fields = Record<string, BlockField>;

type SlotNames<F extends Fields> = {
	[K in keyof F]: F[K] extends SlotField ? K : never;
}[keyof F];

type FieldValue<F> = F extends SlotField
	? BlockNode[]
	: F extends { default: infer V }
		? V
		: never;

/** Stored props of a block besides `id`: slots are child lists, every other prop may be missing and falls back to its default. */
export type PropsOf<F extends Fields> = {
	[K in SlotNames<F>]: BlockNode[];
} & {
	[K in Exclude<keyof F, SlotNames<F>>]?: FieldValue<F[K]>;
};

/** Where the editor's block drawer lists a block: ready-made blocks first, then content, then layout. */
export type BlockGroup = "ready" | "content" | "layout";

export type BlockDefinition<F extends Fields = Fields> = {
	label: string;
	/** One plain sentence for the block drawer, in a salon owner's words. */
	description: string;
	group: BlockGroup;
	fields: F;
	/** Adding a block of this type needs the feature; ones already on the page stay. */
	requires?: Feature;
	/** Names of the slot fields. */
	slots: readonly string[];
	/** Every prop's default, slots included. */
	defaults: Record<string, unknown>;
	/** The props besides `id` and the slots; unknown props are refused. */
	schema: z.ZodObject;
};

export const defineBlock = <const F extends Fields>(definition: {
	label: string;
	description: string;
	group: BlockGroup;
	fields: F;
	requires?: Feature;
}): BlockDefinition<F> => {
	const entries = Object.entries(definition.fields);
	return {
		...definition,
		slots: entries.filter(([, f]) => isSlotField(f)).map(([name]) => name),
		defaults: Object.fromEntries(entries.map(([name, f]) => [name, f.default])),
		schema: z.strictObject(
			Object.fromEntries(
				entries.flatMap(([name, f]) =>
					isSlotField(f) ? [] : [[name, f.schema.optional()]],
				),
			),
		),
	};
};
