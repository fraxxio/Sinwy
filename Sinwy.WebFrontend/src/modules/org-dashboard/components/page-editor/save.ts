import {
	API_ERROR_CODES,
	BLOCKS,
	type Blocks,
	type Feature,
	lockedBlocksIn,
	ownEntry,
	type PageDocument,
} from "@sinwy/shared";
import { getPlanName, minimumPlanFor } from "#/shared/lib/plans";

export type PageData = PageDocument["data"];

export type SaveResult = { ok: true } | { ok: false; message: string };

const definedKeys = (value: object) =>
	Object.keys(value).filter(
		(key) => (value as Record<string, unknown>)[key] !== undefined,
	);

/** Equality of JSON-like values; a key holding `undefined` counts as missing, as it does once saved. */
export const sameJson = (a: unknown, b: unknown): boolean => {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const keys = definedKeys(a);
	if (keys.length !== definedKeys(b).length) return false;
	return keys.every((key) =>
		sameJson(
			(a as Record<string, unknown>)[key],
			(b as Record<string, unknown>)[key],
		),
	);
};

/** Whether the editor's data differs from the saved data; only `root` and `content` are stored. */
export const hasUnsavedChanges = (current: PageData, saved: PageData) =>
	current !== saved &&
	!(
		sameJson(current.root, saved.root) &&
		sameJson(current.content, saved.content)
	);

export const toPageDocument = (data: PageData): PageDocument => ({
	schemaVersion: 2,
	data: { root: data.root, content: data.content },
});

const listOf = (words: string[]) =>
	words.length < 2
		? words.join("")
		: `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;

const planNeededBy = (types: string[], blocks: Blocks) => {
	const feature = types
		.map((type) => ownEntry(blocks, type)?.requires)
		.find((required): required is Feature => required !== undefined);
	const plan = feature && minimumPlanFor(feature);
	return plan ? getPlanName(plan) : null;
};

/** What a failed save tells the owner; a 402 names the blocks the plan doesn't cover. */
export const saveErrorMessage = (
	error: { code: number; message: string },
	{
		saved,
		attempted,
		features,
		blocks = BLOCKS,
	}: {
		saved: PageDocument;
		attempted: PageDocument;
		features: readonly Feature[];
		blocks?: Blocks;
	},
): string => {
	switch (error.code) {
		case API_ERROR_CODES.PAGE_VERSION_CONFLICT:
			return "This page was saved somewhere else, maybe in another tab. Reload to get the latest version; your changes here aren't saved.";
		case API_ERROR_CODES.PLAN_UPGRADE_REQUIRED: {
			const types = lockedBlocksIn(saved, attempted, features, blocks);
			if (!types.length)
				return "Your plan doesn't include one of the blocks on this page.";
			const labels = types.map((type) => ownEntry(blocks, type)?.label ?? type);
			const plan = planNeededBy(types, blocks);
			const noun = labels.length === 1 ? "block" : "blocks";
			return `The ${listOf(labels)} ${noun} ${labels.length === 1 ? "needs" : "need"} ${plan ? `the ${plan} plan` : "a higher plan"}. Remove ${labels.length === 1 ? "it" : "them"} or upgrade to save.`;
		}
		default:
			return error.message;
	}
};
