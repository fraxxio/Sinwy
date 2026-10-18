import { expect, it } from "bun:test";
import { pollUntil } from "../lib/poll-until";

const noSleep = () => Promise.resolve();
const isActive = (status: string) => status === "active";

function sequence(...results: Array<string | null | Error>) {
	let i = 0;
	return () => {
		const r = results[Math.min(i++, results.length - 1)] ?? null;
		return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
	};
}

it("resolves the first value that satisfies the predicate", async () => {
	const result = await pollUntil(sequence("inactive", "active"), isActive, {
		sleep: noSleep,
	});
	expect(result).toBe("active");
});

it("survives a failed or empty read and keeps polling", async () => {
	const result = await pollUntil(
		sequence(new Error("network"), null, "active"),
		isActive,
		{ sleep: noSleep },
	);
	expect(result).toBe("active");
});

it("gives up after the attempt budget", async () => {
	let calls = 0;
	const result = await pollUntil(
		() => {
			calls++;
			return Promise.resolve("inactive");
		},
		isActive,
		{ attempts: 3, sleep: noSleep },
	);
	expect(result).toBeNull();
	expect(calls).toBe(3);
});

it("cancellation resolves null without calling read", async () => {
	let calls = 0;
	const result = await pollUntil(
		() => {
			calls++;
			return Promise.resolve("inactive");
		},
		isActive,
		{ sleep: noSleep, isCancelled: () => true },
	);
	expect(result).toBeNull();
	expect(calls).toBe(0);
});
