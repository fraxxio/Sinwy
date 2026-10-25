import { join } from "node:path";

const steps = [
	{ script: "check", kind: "plain" },
	{ script: "skills:check", kind: "plain" },
	{ script: "typecheck", kind: "plain" },
	{ script: "test:server", kind: "test" },
	{ script: "test:web", kind: "test" },
	{ script: "test:scripts", kind: "test" },
] as const;

export const logFile = ".verify.log";

const fileHeader = /^(\S+\.test\.tsx?):$/;
const logLine = /^\d{4}-\d\d-\d\dT\S+Z (DEBUG|INFO|WARN|ERROR) (.*)$/;
const totals =
	/^\s*(\d+ (pass|fail|skip|todo)|\d+ expect\(\) calls|Ran \d+ tests? across .*)$/;

export const cleanLines = (output: string): string[] =>
	Bun.stripANSI(output)
		.split(/\r?\n/)
		.map((line) => line.replace(/^.*\r/, ""))
		.filter((line) => !line.startsWith("$ "));

// A passing run keeps every signal except the bodies of app log lines: totals,
// distinct WARN/ERROR messages per test file, and any output that isn't the app logger.
export const summarizeTestOutput = (output: string): string[] => {
	const summary: string[] = [];
	const logged = new Map<string, Map<string, number>>();
	const other = new Map<string, string[]>();
	let file = "(setup)";
	let inLogBody = false;

	for (const line of cleanLines(output)) {
		if (inLogBody) {
			if (line === "}") inLogBody = false;
			continue;
		}
		const header = line.match(fileHeader);
		if (header?.[1]) {
			file = header[1];
			continue;
		}
		const log = line.match(logLine);
		if (log) {
			const [, level, rest = ""] = log;
			inLogBody = rest.endsWith(" {");
			if (level === "WARN" || level === "ERROR") {
				const message = `${level} ${rest.replace(/ \{$/, "")}`;
				const counts = logged.get(file) ?? new Map<string, number>();
				counts.set(message, (counts.get(message) ?? 0) + 1);
				logged.set(file, counts);
			}
			continue;
		}
		if (totals.test(line)) {
			summary.push(line.trim());
			continue;
		}
		if (line.trim() === "" || line.startsWith("bun test v")) continue;
		other.set(file, [...(other.get(file) ?? []), line]);
	}

	const lines = [`  ${summary.join(", ")}`];
	if (logged.size > 0) {
		lines.push(
			"  WARN/ERROR logged (expected in error-path tests; flag any that don't fit their test):",
		);
		for (const [name, counts] of logged) {
			lines.push(`    ${name}`);
			for (const [message, count] of counts) {
				lines.push(`      ${count}× ${message}`);
			}
		}
	}
	if (other.size > 0) {
		lines.push("  Other output (not from the app logger):");
		for (const [name, output] of other) {
			lines.push(`    ${name}`, ...output.map((line) => `      ${line}`));
		}
	}
	return lines;
};

const run = async (root: string, script: string) => {
	const started = performance.now();
	const proc = Bun.spawn(["sh", "-c", `bun run ${script} 2>&1`], {
		cwd: root,
		stdout: "pipe",
	});
	const output = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;
	const seconds = ((performance.now() - started) / 1000).toFixed(1);
	return { output, exitCode, seconds };
};

if (import.meta.main) {
	const root = join(import.meta.dir, "..");
	const log: string[] = [];
	const failed: string[] = [];

	for (const { script, kind } of steps) {
		const { output, exitCode, seconds } = await run(root, script);
		log.push(`=== ${script} (exit ${exitCode}) ===`, output);
		const passed = exitCode === 0;
		if (!passed) failed.push(script);
		console.log(
			`${passed ? "PASS" : "FAIL"} ${script} (exit ${exitCode}, ${seconds}s)`,
		);
		const lines =
			passed && kind === "test"
				? summarizeTestOutput(output)
				: cleanLines(output)
						.filter((line) => line.trim() !== "")
						.map((line) => `  ${line}`);
		if (lines.length > 0) console.log(lines.join("\n"));
	}

	await Bun.write(join(root, logFile), log.join("\n"));
	console.log(
		failed.length === 0
			? `\nverify: all ${steps.length} steps passed. Full output: ${logFile}`
			: `\nverify: FAILED (${failed.join(", ")}). Failing steps are printed in full above; full output: ${logFile}`,
	);
	process.exit(failed.length === 0 ? 0 : 1);
}
