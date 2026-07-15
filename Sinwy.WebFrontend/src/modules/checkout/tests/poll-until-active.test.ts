import { expect, it } from "bun:test";
import { pollUntilActive } from "../lib/poll-until-active";

const noSleep = () => Promise.resolve();

function sequence(...results: Array<string | null | Error>) {
	let i = 0;
	return () => {
		const r = results[Math.min(i++, results.length - 1)] ?? null;
		return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
	};
}

it("resolves true when status becomes active", async () => {
	const result = await pollUntilActive(sequence("inactive", "active"), {
		sleep: noSleep,
	});
	expect(result).toBe(true);
});

it("survives a failed request and keeps polling", async () => {
	const result = await pollUntilActive(
		sequence(new Error("network"), "active"),
		{ sleep: noSleep },
	);
	expect(result).toBe(true);
});

it("gives up after the attempt budget", async () => {
	const result = await pollUntilActive(sequence("inactive"), {
		attempts: 3,
		sleep: noSleep,
	});
	expect(result).toBe(false);
});

it("cancellation resolves false without calling getStatus", async () => {
	let calls = 0;
	const result = await pollUntilActive(
		() => {
			calls++;
			return Promise.resolve("inactive");
		},
		{ sleep: noSleep, isCancelled: () => true },
	);
	expect(result).toBe(false);
	expect(calls).toBe(0);
});
