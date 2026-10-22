import { expect, test } from "bun:test";
import { join } from "node:path";

// a fresh process: within the test run other files have already loaded auth
test("billing can be loaded before auth", async () => {
	const proc = Bun.spawn(
		[
			"bun",
			"-e",
			'await import("@billingModule"); await import("@authModule");',
		],
		{
			cwd: join(import.meta.dir, "../../.."),
			env: process.env,
			stderr: "pipe",
		},
	);
	const exitCode = await proc.exited;
	const stderr = await new Response(proc.stderr).text();

	expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
});
