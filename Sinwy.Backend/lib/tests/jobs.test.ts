import { expect, test } from "bun:test";
import db from "@db";
import { sql } from "drizzle-orm";
import { type Job, runJob } from "../jobs";

const job = (run: () => Promise<string>): Job<string> => ({
	name: "test-job",
	intervalMs: 60_000,
	run,
});

test("a job runs and returns its result when nobody else holds its lock", async () => {
	expect(await runJob(job(() => Promise.resolve("done")))).toBe("done");
});

test("a job already running elsewhere is skipped, and runs again once it is released", async () => {
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let locked = () => {};
	const isLocked = new Promise<void>((resolve) => {
		locked = resolve;
	});
	const other = db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtext(${"test-job"}))`,
		);
		locked();
		await held;
	});
	await isLocked;

	let runs = 0;
	const counted = job(() => Promise.resolve(`run ${++runs}`));
	expect(await runJob(counted)).toBeNull();
	expect(runs).toBe(0);

	release();
	await other;
	expect(await runJob(counted)).toBe("run 1");
});

test("a failed run releases the lock", async () => {
	await expect(
		runJob(job(() => Promise.reject(new Error("boom")))),
	).rejects.toThrow("boom");
	expect(await runJob(job(() => Promise.resolve("again")))).toBe("again");
});
