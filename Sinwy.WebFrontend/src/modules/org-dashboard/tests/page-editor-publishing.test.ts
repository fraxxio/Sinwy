import { describe, expect, it } from "bun:test";
import {
	API_ERROR_CODES,
	type ApiResponse,
	type PageDetailDto,
} from "@sinwy/shared";
import {
	type Clock,
	createAutosave,
	type SaveOutcome,
} from "../components/page-editor/autosave";
import {
	discardAfterSave,
	publishAfterSave,
} from "../components/page-editor/publishing";
import type { PageData } from "../components/page-editor/save";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Timers never fire: saves here start only from a flush. */
const stillClock: Clock = {
	now: () => 0,
	setTimeout: () => 0,
	clearTimeout: () => {},
};

/** Calls that wait until the test answers them, in order. */
const deferred = <A, R>() => {
	const calls: { arg: A; answer: (result: R) => Promise<unknown> }[] = [];
	const fn = (arg: A) =>
		new Promise<R>((resolve) => {
			calls.push({
				arg,
				answer: (result) => {
					resolve(result);
					return settle();
				},
			});
		});
	const call = (index: number) => {
		const found = calls[index];
		if (!found) throw new Error(`No call ${index}`);
		return found;
	};
	return { fn, calls, call };
};

const doc = (text: string): PageData => ({
	root: { props: {} },
	content: [{ type: "Heading", props: { id: "heading-1", text } }],
});

const page = { id: "page-1" } as PageDetailDto;
const done: ApiResponse<PageDetailDto> = {
	isSuccess: true,
	data: page,
	message: null,
	code: 200,
};
const conflict: ApiResponse<PageDetailDto> = {
	isSuccess: false,
	data: null,
	message: "This page was saved somewhere else.",
	code: API_ERROR_CODES.PAGE_VERSION_CONFLICT,
};

const setup = () => {
	const saves = deferred<{ data: PageData; base: number }, SaveOutcome>();
	const writes = deferred<number, ApiResponse<PageDetailDto>>();
	const autosave = createAutosave({
		data: doc("start"),
		base: 1,
		save: (data, base) => saves.fn({ data, base }),
		clock: stillClock,
	});
	/** A save of `text` that is in flight until the test answers it. */
	const saving = (text: string) => {
		autosave.change(doc(text));
		void autosave.flush();
	};
	return { autosave, saves, writes, saving };
};

describe("publish after save", () => {
	it("waits for the save in flight and publishes the version it made", async () => {
		const { autosave, saves, writes, saving } = setup();
		saving("typed");
		const outcome = publishAfterSave(autosave, doc("typed"), writes.fn);
		await settle();
		expect(writes.calls).toHaveLength(0);

		await saves.call(0).answer({ ok: true, base: 2 });
		expect(writes.calls.map((call) => call.arg)).toEqual([2]);
		await writes.call(0).answer(done);
		expect(await outcome).toEqual({ ok: true, page });
	});

	it("saves what was typed after the save in flight before publishing", async () => {
		const { autosave, saves, writes, saving } = setup();
		saving("typ");
		const outcome = publishAfterSave(autosave, doc("typed"), writes.fn);
		await saves.call(0).answer({ ok: true, base: 2 });
		expect(saves.call(1).arg).toEqual({ data: doc("typed"), base: 2 });
		expect(writes.calls).toHaveLength(0);

		await saves.call(1).answer({ ok: true, base: 3 });
		await writes.call(0).answer(done);
		expect(writes.calls.map((call) => call.arg)).toEqual([3]);
		expect((await outcome).ok).toBe(true);
	});

	it("doesn't publish when the save fails, and says why", async () => {
		const { autosave, saves, writes } = setup();
		const outcome = publishAfterSave(autosave, doc("typed"), writes.fn);
		await saves.call(0).answer({ ok: false, code: 0, message: "Offline" });
		expect(await outcome).toEqual({
			ok: false,
			code: 0,
			message: "Your latest changes couldn't be saved. Check your connection.",
		});
		expect(writes.calls).toHaveLength(0);
	});

	it("publishes again when its own save got there first", async () => {
		const { autosave, saves, writes, saving } = setup();
		const outcome = publishAfterSave(autosave, doc("start"), writes.fn);
		await settle();
		expect(writes.calls.map((call) => call.arg)).toEqual([1]);

		saving("more");
		await saves.call(0).answer({ ok: true, base: 2 });
		await writes.call(0).answer(conflict);
		expect(writes.calls.map((call) => call.arg)).toEqual([1, 2]);
		await writes.call(1).answer(done);
		expect((await outcome).ok).toBe(true);
	});

	it("reports a version saved somewhere else instead of publishing it", async () => {
		const { autosave, writes } = setup();
		const outcome = publishAfterSave(autosave, doc("start"), writes.fn);
		await settle();
		await writes.call(0).answer(conflict);
		expect(await outcome).toMatchObject({
			ok: false,
			code: API_ERROR_CODES.PAGE_VERSION_CONFLICT,
		});
		expect(writes.calls).toHaveLength(1);
	});
});

describe("discard after save", () => {
	it("lets the save in flight land first and discards at its version, with no save after", async () => {
		const { autosave, saves, writes, saving } = setup();
		saving("typed");
		const outcome = discardAfterSave(autosave, doc("typed"), writes.fn);
		await settle();
		expect(writes.calls).toHaveLength(0);

		await saves.call(0).answer({ ok: true, base: 2 });
		expect(writes.calls.map((call) => call.arg)).toEqual([2]);
		await writes.call(0).answer(done);
		expect(await outcome).toEqual({ ok: true, page });
		expect(saves.calls).toHaveLength(1);
		expect(autosave.getState().status).toBe("saved");
	});

	it("still discards a draft the plan refuses to save", async () => {
		const { autosave, saves, writes } = setup();
		const outcome = discardAfterSave(autosave, doc("locked"), writes.fn);
		await saves.call(0).answer({
			ok: false,
			code: API_ERROR_CODES.PLAN_UPGRADE_REQUIRED,
			message: "Upgrade to use Booking",
		});
		expect(writes.calls.map((call) => call.arg)).toEqual([1]);
		await writes.call(0).answer(done);
		expect((await outcome).ok).toBe(true);
	});

	it("passes on the 409 when the page moved", async () => {
		const { autosave, writes } = setup();
		const outcome = discardAfterSave(autosave, doc("start"), writes.fn);
		await settle();
		await writes.call(0).answer(conflict);
		expect(await outcome).toMatchObject({
			ok: false,
			code: API_ERROR_CODES.PAGE_VERSION_CONFLICT,
		});
	});
});
