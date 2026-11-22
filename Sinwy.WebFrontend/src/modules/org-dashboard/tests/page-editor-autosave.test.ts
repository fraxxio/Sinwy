import { describe, expect, it } from "bun:test";
import { API_ERROR_CODES } from "@sinwy/shared";
import {
	AUTOSAVE_DEBOUNCE_MS,
	AUTOSAVE_MAX_WAIT_MS,
	type Clock,
	createAutosave,
	RETRY_DELAYS_MS,
	type SaveFn,
	type SaveOutcome,
} from "../components/page-editor/autosave";
import type { PageData } from "../components/page-editor/save";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const fakeClock = () => {
	let now = 0;
	let nextId = 1;
	const timers = new Map<number, { at: number; run: () => void }>();
	const clock: Clock = {
		now: () => now,
		setTimeout: (run, ms) => {
			const id = nextId++;
			timers.set(id, { at: now + ms, run });
			return id;
		},
		clearTimeout: (id) => {
			timers.delete(id as number);
		},
	};
	const advance = async (ms: number) => {
		const end = now + ms;
		for (;;) {
			const [due] = [...timers]
				.filter(([, timer]) => timer.at <= end)
				.sort(([a, x], [b, y]) => x.at - y.at || a - b);
			if (!due) break;
			timers.delete(due[0]);
			now = due[1].at;
			due[1].run();
			await settle();
		}
		now = end;
		await settle();
	};
	return { clock, advance };
};

const fakeSave = () => {
	const calls: {
		data: PageData;
		base: number;
		resolve: (outcome: SaveOutcome) => Promise<unknown>;
	}[] = [];
	const save: SaveFn = (data, base) =>
		new Promise((resolve) => {
			calls.push({
				data,
				base,
				resolve: (outcome) => {
					resolve(outcome);
					return settle();
				},
			});
		});
	const call = (index: number) => {
		const found = calls[index];
		if (!found) throw new Error(`No save call ${index}`);
		return found;
	};
	return { save, calls, call };
};

const doc = (text: string): PageData => ({
	root: { props: {} },
	content: [{ type: "Heading", props: { id: "heading-1", text } }],
});

const ok = (base: number): SaveOutcome => ({ ok: true, base });
const fail = (code: number, message = "Nope"): SaveOutcome => ({
	ok: false,
	code,
	message,
});

const setup = () => {
	const { clock, advance } = fakeClock();
	const { save, calls, call } = fakeSave();
	const autosave = createAutosave({ data: doc("start"), base: 1, save, clock });
	const status = () => autosave.getState().status;
	/** Changes the document and lets the debounce fire, so a save starts. */
	const edit = async (title: string) => {
		autosave.change(doc(title));
		await advance(AUTOSAVE_DEBOUNCE_MS);
	};
	return { autosave, advance, calls, call, status, edit, clock };
};

describe("autosave timing", () => {
	it("saves once a second after the last change", async () => {
		const { autosave, advance, calls, status, call } = setup();
		autosave.change(doc("a"));
		expect(status()).toBe("pending");
		await advance(600);
		autosave.change(doc("ab"));
		await advance(AUTOSAVE_DEBOUNCE_MS - 1);
		expect(calls).toHaveLength(0);
		await advance(1);
		expect(calls.map((call) => call.data)).toEqual([doc("ab")]);
		expect(status()).toBe("saving");
		await call(0).resolve(ok(2));
		expect(status()).toBe("saved");
	});

	it("saves at most every 10 seconds during continuous changes", async () => {
		const { autosave, advance, calls } = setup();
		for (let ms = 0; ms < AUTOSAVE_MAX_WAIT_MS; ms += 500) {
			autosave.change(doc(`typed ${ms}`));
			await advance(500);
		}
		expect(calls.map((call) => call.data)).toEqual([doc("typed 9500")]);
	});

	it("doesn't save a change that was undone", async () => {
		const { autosave, advance, calls, status } = setup();
		autosave.change(doc("a"));
		autosave.change(doc("start"));
		expect(status()).toBe("saved");
		await advance(AUTOSAVE_MAX_WAIT_MS);
		expect(calls).toHaveLength(0);
	});
});

describe("autosave queue", () => {
	it("never runs two saves at once and sends the follow-up with the new base", async () => {
		const { autosave, advance, calls, status, edit, call } = setup();
		await edit("a");
		autosave.change(doc("ab"));
		autosave.change(doc("abc"));
		await advance(AUTOSAVE_MAX_WAIT_MS);
		expect(calls).toHaveLength(1);
		expect(status()).toBe("saving");

		await call(0).resolve(ok(4));
		expect(calls).toHaveLength(2);
		expect(call(1)).toMatchObject({ data: doc("abc"), base: 4 });

		await call(1).resolve(ok(5));
		expect(status()).toBe("saved");
		expect(autosave.getBase()).toBe(5);
	});

	it("lets a change made during a save wait for its own debounce", async () => {
		const { autosave, advance, calls, status, edit, call } = setup();
		await edit("a");
		autosave.change(doc("ab"));
		await call(0).resolve(ok(2));
		expect(status()).toBe("pending");
		expect(calls).toHaveLength(1);
		await advance(AUTOSAVE_DEBOUNCE_MS);
		expect(call(1)).toMatchObject({ data: doc("ab"), base: 2 });
	});

	it("ignores a save still in flight after a reset", async () => {
		const { autosave, status, edit, call } = setup();
		await edit("a");
		autosave.reset(doc("published"), 9);
		await call(0).resolve(fail(API_ERROR_CODES.PAGE_VERSION_CONFLICT));
		expect(status()).toBe("saved");

		await edit("b");
		expect(call(1)).toMatchObject({ data: doc("b"), base: 9 });
	});

	it("stops saving once disposed", async () => {
		const { autosave, calls, edit } = setup();
		autosave.dispose();
		await edit("a");
		expect(calls).toHaveLength(0);
	});
});

describe("autosave failures", () => {
	it("never retries a conflict and saves over it only through resolveConflict", async () => {
		const { autosave, advance, calls, status, edit, call } = setup();
		await edit("a");
		await call(0).resolve(fail(API_ERROR_CODES.PAGE_VERSION_CONFLICT));
		expect(status()).toBe("conflict");

		autosave.change(doc("ab"));
		await advance(60_000);
		expect(calls).toHaveLength(1);
		expect(await autosave.flush()).toMatchObject({ status: "conflict" });

		const resolved = autosave.resolveConflict(7);
		expect(call(1)).toMatchObject({ data: doc("ab"), base: 7 });
		await call(1).resolve(ok(8));
		expect(await resolved).toEqual({ status: "saved" });
	});

	it.each([
		400,
		413,
		API_ERROR_CODES.PLAN_UPGRADE_REQUIRED,
	])("doesn't retry a %i and tries once more after a real change", async (code) => {
		const { autosave, advance, calls, status, edit, call } = setup();
		await edit("locked");
		await call(0).resolve(fail(code, "Remove the block"));
		expect(autosave.getState()).toEqual({
			status: "blocked",
			message: "Remove the block",
		});

		await advance(60_000);
		autosave.change(doc("locked"));
		await advance(60_000);
		expect(calls).toHaveLength(1);
		expect(status()).toBe("blocked");

		await edit("unlocked");
		expect(calls).toHaveLength(2);
		await call(1).resolve(ok(2));
		expect(status()).toBe("saved");
	});

	it("leaves the blocked state when the change is undone", async () => {
		const { autosave, status, edit, call } = setup();
		await edit("locked");
		await call(0).resolve(fail(API_ERROR_CODES.PLAN_UPGRADE_REQUIRED));
		autosave.change(doc("start"));
		expect(status()).toBe("saved");
	});

	it.each([
		0, 500, 503, 429,
	])("backs off after a %i and returns to saved on success", async (code) => {
		const { autosave, advance, calls, clock, edit, call } = setup();
		await edit("a");
		for (const [index, delay] of [...RETRY_DELAYS_MS, 30_000].entries()) {
			await call(index).resolve(fail(code, "Network error"));
			expect(autosave.getState()).toEqual({
				status: "failed",
				message: "Network error",
				attempt: index + 1,
				retryAt: clock.now() + delay,
			});
			await advance(delay - 1);
			expect(calls).toHaveLength(index + 1);
			await advance(1);
			expect(calls).toHaveLength(index + 2);
		}
		await call(calls.length - 1).resolve(ok(2));
		expect(autosave.getState()).toEqual({ status: "saved" });
	});

	it("saves changes made while failed on the next retry, not sooner", async () => {
		const { autosave, advance, calls, edit, call } = setup();
		await edit("a");
		await call(0).resolve(fail(0));
		await advance(RETRY_DELAYS_MS[0]);
		await call(1).resolve(fail(0));
		autosave.change(doc("ab"));
		await advance(AUTOSAVE_DEBOUNCE_MS);
		expect(calls).toHaveLength(2);
		await advance(RETRY_DELAYS_MS[1] - AUTOSAVE_DEBOUNCE_MS);
		expect(call(2).data).toEqual(doc("ab"));
	});

	it("retries at once on retryNow", async () => {
		const { autosave, calls, edit, call } = setup();
		await edit("a");
		await call(0).resolve(fail(502));
		autosave.retryNow();
		expect(calls).toHaveLength(2);
		await call(1).resolve(ok(2));
		expect(autosave.getState()).toEqual({ status: "saved" });
	});
});

describe("autosave flush", () => {
	it("saves a pending change without waiting for the debounce", async () => {
		const { autosave, calls, call } = setup();
		autosave.change(doc("a"));
		const flushed = autosave.flush();
		expect(calls).toHaveLength(1);
		await call(0).resolve(ok(2));
		expect(await flushed).toEqual({ status: "saved" });
	});

	it("waits for the save in flight and the pending one", async () => {
		const { autosave, calls, edit, call } = setup();
		await edit("a");
		autosave.change(doc("ab"));
		let done = false;
		const flushed = autosave.flush().finally(() => {
			done = true;
		});

		await call(0).resolve(ok(2));
		expect(done).toBe(false);
		expect(call(1)).toMatchObject({ data: doc("ab"), base: 2 });

		await call(1).resolve(ok(3));
		expect(await flushed).toEqual({ status: "saved" });
		expect(calls).toHaveLength(2);
	});

	it("reports a failure after one attempt", async () => {
		const { autosave, calls, call } = setup();
		autosave.change(doc("a"));
		const flushed = autosave.flush();
		await call(0).resolve(fail(0, "Network error"));
		expect(await flushed).toMatchObject({ status: "failed" });
		expect(calls).toHaveLength(1);
	});

	it("tries a failed save once more at once", async () => {
		const { autosave, calls, edit, call } = setup();
		await edit("a");
		await call(0).resolve(fail(0));
		const flushed = autosave.flush();
		expect(calls).toHaveLength(2);
		await call(1).resolve(ok(2));
		expect(await flushed).toEqual({ status: "saved" });
	});

	it("reports a blocked save without sending it again", async () => {
		const { autosave, calls, edit, call } = setup();
		await edit("a");
		await call(0).resolve(fail(API_ERROR_CODES.PLAN_UPGRADE_REQUIRED));
		expect(await autosave.flush()).toMatchObject({ status: "blocked" });
		expect(calls).toHaveLength(1);
	});

	it("resolves at once when nothing is unsaved", async () => {
		const { autosave, calls } = setup();
		expect(await autosave.flush()).toEqual({ status: "saved" });
		expect(calls).toHaveLength(0);
	});
});

describe("autosave subscription", () => {
	it("notifies on each state change and keeps the state object stable between", async () => {
		const { autosave, edit, call } = setup();
		const seen: string[] = [];
		const unsubscribe = autosave.subscribe(() =>
			seen.push(autosave.getState().status),
		);
		autosave.change(doc("a"));
		const pending = autosave.getState();
		autosave.change(doc("ab"));
		expect(autosave.getState()).toBe(pending);
		await edit("abc");
		await call(0).resolve(ok(2));
		unsubscribe();
		autosave.change(doc("abcd"));
		expect(seen).toEqual(["pending", "saving", "saved"]);
	});
});
