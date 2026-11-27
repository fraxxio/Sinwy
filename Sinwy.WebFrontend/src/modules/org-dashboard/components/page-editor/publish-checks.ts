import {
	BLOCKS,
	type BlockField,
	type BlockNode,
	type Blocks,
	linkTarget,
	normalizeRichText,
	ownEntry,
} from "@sinwy/shared";
import { blockTitle } from "./block-actions";
import { linkedPage, type NamedPage } from "./links";

/** Something on a page an owner most likely meant to fill in before publishing. */
export type PublishIssue = {
	/** The block's id, to select it in the editor. */
	id: string;
	/** Tells the block apart from the others, like "Image 2 in Photos" or "Heading in Find us". */
	block: string;
	problem: string;
};

/** What a link can still open: the org's active services and its other live pages. */
export type LinkDestinations = {
	services: readonly { id: string }[];
	pages: readonly NamedPage[];
};

const sameText = (field: BlockField, value: string) =>
	field.kind === "richText"
		? normalizeRichText(value) === normalizeRichText(String(field.default))
		: value.trim() === String(field.default).trim();

function brokenLink(href: string, destinations: LinkDestinations) {
	const target = linkTarget(href);
	if (
		target.kind === "service" &&
		!destinations.services.some((s) => s.id === target.serviceId)
	)
		return "Opens booking for a service you no longer offer";
	if (target.kind === "page" && !linkedPage(target, destinations.pages))
		return "Opens a page that isn't live, so customers won't see it";
	return null;
}

function problemWith(
	field: BlockField,
	stored: unknown,
	destinations: LinkDestinations,
): string | null {
	const value = stored ?? field.default;
	if (typeof value !== "string") return null;
	if (field.required && !value.trim())
		return field.kind === "image"
			? "Has no photo"
			: `Has no ${field.label.toLowerCase()}`;
	if (field.placeholder && sameText(field, value))
		return `Still has its sample ${field.label.toLowerCase()}`;
	if (field.kind === "link") return brokenLink(value, destinations);
	return null;
}

/** Slots the page shows; Columns keeps the content of the columns its count hides. */
function shownSlots(block: BlockNode, slots: readonly string[]) {
	if (block.type !== "Columns") return slots;
	return slots.slice(
		0,
		Number(block.props["count"] ?? BLOCKS.Columns.defaults["count"]),
	);
}

/** "Image 2 in Photos": the block's label, its place among same-type siblings, and the block around it. */
function nameOf(
	block: BlockNode,
	siblings: readonly BlockNode[],
	parent: BlockNode | null,
	blocks: Blocks,
) {
	const label = ownEntry(blocks, block.type)?.label ?? block.type;
	const own = blockTitle(block, blocks);
	if (own) return `${label} · ${own}`;
	if (!parent) return label;
	const same = siblings.filter((sibling) => sibling.type === block.type);
	const place = same.length > 1 ? ` ${same.indexOf(block) + 1}` : "";
	const around =
		blockTitle(parent, blocks) ?? ownEntry(blocks, parent.type)?.label;
	return `${label}${place} in ${around}`;
}

/** Empty photos, links and labels, sample text left as it is, and links that go nowhere, in reading order, through every shown slot. */
export function publishIssues(
	content: readonly BlockNode[],
	destinations: LinkDestinations,
	blocks: Blocks = BLOCKS,
): PublishIssue[] {
	const issues: PublishIssue[] = [];
	const walk = (list: unknown, parent: BlockNode | null) => {
		if (!Array.isArray(list)) return;
		const siblings = list as BlockNode[];
		for (const block of siblings) {
			const definition = ownEntry(blocks, block.type);
			if (!definition) continue;
			for (const [name, field] of Object.entries(definition.fields)) {
				const problem = problemWith(field, block.props[name], destinations);
				if (problem)
					issues.push({
						id: block.props.id,
						block: nameOf(block, siblings, parent, blocks),
						problem,
					});
			}
			for (const slot of shownSlots(block, definition.slots))
				walk(block.props[slot], block);
		}
	};
	walk(content, null);
	return issues;
}
