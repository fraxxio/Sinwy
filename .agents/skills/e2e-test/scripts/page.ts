// What a user sees on the current playwright-cli page, as text: URL, title, open
// dialogs, alerts and toasts, then the visible text of `main` (or the selector given).
// Usage: bun .agents/skills/e2e-test/scripts/page.ts [selector] [max-chars]
const selector = process.argv[2] ?? "main";
const maxChars = Number(process.argv[3] ?? 4000);

const read = (args: { selector: string; maxChars: number }) => {
	const text = (element: Element) =>
		(element as HTMLElement).innerText.replace(/\n{3,}/g, "\n\n").trim();
	const all = (query: string) =>
		[...document.querySelectorAll(query)].map(text).filter(Boolean);

	const root = document.querySelector(args.selector);
	const body = root ? text(root) : "";
	const lines = [`URL: ${location.href}`, `Title: ${document.title}`];
	for (const dialog of all('[role="dialog"], [role="alertdialog"]')) {
		lines.push(`Dialog: ${dialog}`);
	}
	const notices = all('[role="alert"], [role="status"], [data-sonner-toast]');
	if (notices.length > 0) lines.push(`Alerts: ${notices.join(" | ")}`);
	if (!root) {
		lines.push(`--- ${args.selector}: no match ---`);
	} else if (body.length > args.maxChars) {
		lines.push(
			`--- ${args.selector} (first ${args.maxChars} of ${body.length} characters; pass a narrower selector) ---`,
			body.slice(0, args.maxChars),
		);
	} else {
		lines.push(`--- ${args.selector} ---`, body);
	}
	return lines.join("\n");
};

const expression = `(${read.toString()})(${JSON.stringify({ selector, maxChars })})`;
const proc = Bun.spawn(
	["bunx", "playwright-cli", "--raw", "eval", expression],
	{
		stdout: "pipe",
		stderr: "pipe",
	},
);
const [stdout, stderr, exitCode] = await Promise.all([
	new Response(proc.stdout).text(),
	new Response(proc.stderr).text(),
	proc.exited,
]);
const output = stdout.trim();
if (exitCode !== 0 || !output.startsWith('"')) {
	console.error(output || stderr.trim() || `playwright-cli exited ${exitCode}`);
	process.exit(1);
}
console.log(JSON.parse(output));
