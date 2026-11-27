import { readFileSync } from "node:fs";
import { join } from "node:path";

export const WEB_URL = process.env["WEB_URL"] ?? "http://localhost:3000";
export const BACKEND_URL =
	process.env["BACKEND_URL"] ?? "http://localhost:3001";

export const REPO_ROOT = join(import.meta.dirname, "../..");
/** Inside `.playwright-cli/`, which git ignores, because the stored sessions are credentials. */
export const OUTPUT_DIR = join(REPO_ROOT, ".playwright-cli/editor-e2e");
export const STACK_FILE = join(OUTPUT_DIR, "stack.json");

export type SeededOrg = {
	orgId: string;
	slug: string;
	ownerEmail: string;
	storageStateFile: string;
};

/** What the global setup seeded for this run; there are several Professional orgs because one holds only 5 pages. */
export type Stack = {
	pro: SeededOrg;
	secondPro: SeededOrg;
	thirdPro: SeededOrg;
	/** Photo uploads; its files count against its own storage quota. */
	photos: SeededOrg;
	/** Button links; holds services and a second live page. */
	links: SeededOrg;
	starter: SeededOrg;
};

export const readStack = (): Stack =>
	JSON.parse(readFileSync(STACK_FILE, "utf8")) as Stack;
