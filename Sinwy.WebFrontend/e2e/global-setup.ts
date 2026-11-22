import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
	BACKEND_URL,
	OUTPUT_DIR,
	REPO_ROOT,
	type SeededOrg,
	STACK_FILE,
	type Stack,
	WEB_URL,
} from "./stack";

const exec = promisify(execFile);

const requireServer = async (name: string, url: string, start: string) => {
	const up = await fetch(url).then(
		() => true,
		() => false,
	);
	if (!up)
		throw new Error(
			`The editor spec needs the ${name} at ${url}. Start it with \`${start}\` and run it again.`,
		);
};

/** Runs a dev script from the repo root and parses the JSON it prints. */
const devScript = async <T>(...args: string[]): Promise<T> => {
	try {
		const { stdout } = await exec("bun", ["run", "--silent", ...args], {
			cwd: REPO_ROOT,
		});
		return JSON.parse(stdout) as T;
	} catch (error) {
		const stderr = (error as { stderr?: string }).stderr?.trim();
		throw new Error(`bun run ${args.join(" ")} failed: ${stderr || error}`);
	}
};

type Seed = {
	organization: { id: string; slug: string };
	users: { role: string; email: string }[];
};

const seedOrg = async (
	scenario: "pro-org" | "subscribed-org",
): Promise<SeededOrg> => {
	const seed = await devScript<Seed>(
		"dev:seed-scenario",
		scenario,
		"--url",
		BACKEND_URL,
	);
	const owner = seed.users.find((user) => user.role === "owner");
	if (!owner) throw new Error(`${scenario} seeded no owner`);
	const { storageStateFile } = await devScript<{ storageStateFile: string }>(
		"dev:login-as",
		"--email",
		owner.email,
		"--state",
	);
	return {
		orgId: seed.organization.id,
		slug: seed.organization.slug,
		ownerEmail: owner.email,
		storageStateFile,
	};
};

export default async function globalSetup() {
	await requireServer("backend", BACKEND_URL, "bun run start:server");
	await requireServer("web app", WEB_URL, "bun run start:web");

	const [pro, secondPro, starter] = await Promise.all([
		seedOrg("pro-org"),
		seedOrg("pro-org"),
		seedOrg("subscribed-org"),
	]);
	const stack: Stack = { pro, secondPro, starter };
	await mkdir(OUTPUT_DIR, { recursive: true });
	await writeFile(STACK_FILE, JSON.stringify(stack, null, "\t"));
}
