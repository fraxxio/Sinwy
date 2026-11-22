import {
	API_ERROR_CODES,
	type ApiResponse,
	type PageDetailDto,
} from "@sinwy/shared";
import type { Autosave, AutosaveState } from "./autosave";
import type { PageData } from "./save";

type PageWrite = (base: number) => Promise<ApiResponse<PageDetailDto>>;

export type PageWriteOutcome =
	| { ok: true; page: PageDetailDto }
	| { ok: false; code: number; message: string };

/** Why the owner's changes aren't saved, in a sentence. */
export const unsavedReason = (state: AutosaveState) => {
	switch (state.status) {
		case "conflict":
			return "This page was saved somewhere else, so your changes here aren't saved.";
		case "blocked":
			return state.message;
		case "failed":
			return "Your latest changes couldn't be saved. Check your connection.";
		default:
			return "Your latest changes aren't saved yet.";
	}
};

/** A flush saved what it was asked to; `pending` means only newer changes wait. */
const flushed = (state: AutosaveState) =>
	state.status === "saved" || state.status === "pending";

const failed = (res: { code: number; message: string }): PageWriteOutcome => ({
	ok: false,
	code: res.code,
	message: res.message,
});

/**
 * Saves the document, then publishes the version that save left. When one of
 * this editor's own saves lands first, it publishes again with that one; a
 * newer version from anywhere else is a conflict.
 */
export async function publishAfterSave(
	autosave: Autosave,
	data: PageData,
	publish: PageWrite,
): Promise<PageWriteOutcome> {
	autosave.change(data);
	let state = await autosave.flush();
	for (let attempt = 1; ; attempt++) {
		if (!flushed(state))
			return failed({ code: 0, message: unsavedReason(state) });
		const base = autosave.getBase();
		const res = await publish(base);
		if (res.isSuccess) return { ok: true, page: res.data };
		if (res.code !== API_ERROR_CODES.PAGE_VERSION_CONFLICT || attempt > 1)
			return failed(res);
		state = await autosave.flush();
		if (autosave.getBase() === base) return failed(res);
	}
}

/**
 * Saves what's pending first, so none of this editor's saves can land after
 * the discard. Anything else saved meanwhile makes the discard a 409.
 */
export async function discardAfterSave(
	autosave: Autosave,
	data: PageData,
	discard: PageWrite,
): Promise<PageWriteOutcome> {
	autosave.change(data);
	await autosave.flush();
	const res = await discard(autosave.getBase());
	return res.isSuccess ? { ok: true, page: res.data } : failed(res);
}
