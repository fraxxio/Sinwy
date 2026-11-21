import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { OUTPUT_DIR, REPO_ROOT, WEB_URL } from "./e2e/stack";

/** The system Chromium that `playwright-cli` already uses, so no browser download is needed. */
const { browser } = JSON.parse(
	readFileSync(join(REPO_ROOT, ".playwright/cli.config.json"), "utf8"),
) as { browser: { launchOptions: { executablePath: string } } };

export default defineConfig({
	testDir: "e2e",
	// bun test would pick up *.spec.ts files
	testMatch: "*.e2e.ts",
	globalSetup: "./e2e/global-setup.ts",
	outputDir: join(OUTPUT_DIR, "results"),
	workers: 1,
	retries: 0,
	forbidOnly: true,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: "list",
	use: {
		baseURL: WEB_URL,
		browserName: "chromium",
		launchOptions: { executablePath: browser.launchOptions.executablePath },
		viewport: { width: 1440, height: 900 },
		trace: "retain-on-failure",
	},
});
