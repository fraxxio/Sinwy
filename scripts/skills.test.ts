import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readlink, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSkills } from "./checkSkills";
import { linkSkills } from "./linkSkills";

let root: string;

const writeSkill = async (name: string, skillMd: string) => {
	await mkdir(join(root, ".agents", "skills", name), { recursive: true });
	await Bun.write(join(root, ".agents", "skills", name, "SKILL.md"), skillMd);
};

const validSkill = (name: string) =>
	`---\nname: ${name}\ndescription: Does a thing. Use when the thing is needed.\n---\n\n# ${name}\n`;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "sinwy-skills-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("linkSkills", () => {
	test("links each skill relatively and changes nothing on a second run", async () => {
		await writeSkill("alpha", validSkill("alpha"));

		expect(await linkSkills(root)).toEqual([
			"linked .claude/skills/alpha -> ../../.agents/skills/alpha",
		]);
		expect(await readlink(join(root, ".claude", "skills", "alpha"))).toBe(
			"../../.agents/skills/alpha",
		);
		expect(await linkSkills(root)).toEqual([]);
	});

	test("removes links whose target is gone and keeps other links", async () => {
		await writeSkill("alpha", validSkill("alpha"));
		await linkSkills(root);
		await symlink(
			"../../.agents/skills/gone",
			join(root, ".claude", "skills", "gone"),
		);

		expect(await linkSkills(root)).toEqual([
			"removed .claude/skills/gone (target is gone)",
		]);
		expect(
			await lstat(join(root, ".claude", "skills", "gone")).catch(
				() => undefined,
			),
		).toBe(undefined);
		expect(await readlink(join(root, ".claude", "skills", "alpha"))).toBe(
			"../../.agents/skills/alpha",
		);
	});

	test("refuses to replace a real directory in .claude/skills", async () => {
		await writeSkill("alpha", validSkill("alpha"));
		await mkdir(join(root, ".claude", "skills", "alpha"), { recursive: true });

		await expect(linkSkills(root)).rejects.toThrow(
			"is a real directory, not a link",
		);
	});
});

describe("checkSkills", () => {
	test("passes a valid, linked skill", async () => {
		await writeSkill("alpha", validSkill("alpha"));
		await linkSkills(root);

		expect(await checkSkills(root)).toEqual({ skills: ["alpha"], errors: [] });
	});

	test("passes a user-only skill", async () => {
		await writeSkill(
			"alpha",
			"---\nname: alpha\ndescription: Does a thing.\ndisable-model-invocation: true\n---\n",
		);
		await linkSkills(root);

		expect(await checkSkills(root)).toEqual({ skills: ["alpha"], errors: [] });
	});

	test("reports a non-boolean disable-model-invocation", async () => {
		await writeSkill(
			"alpha",
			"---\nname: alpha\ndescription: Does a thing.\ndisable-model-invocation: yes please\n---\n",
		);
		await linkSkills(root);

		const { errors } = await checkSkills(root);

		expect(errors).toEqual([
			".agents/skills/alpha: frontmatter disable-model-invocation: Invalid input: expected boolean, received string",
		]);
	});

	test("reports each format problem of a broken skill", async () => {
		await writeSkill(
			"broken",
			"---\nname: Broken_Skill\ndescription: ''\nallowed-tools: Bash(ls)\n---\nSee ~/.claude/skills and mcp__polar__search.\n",
		);
		await Bun.write(join(root, ".agents", "skills", "broken", "notes.txt"), "");
		await linkSkills(root);

		const { errors } = await checkSkills(root);

		expect(errors).toEqual([
			'.agents/skills/broken: unexpected "notes.txt"; a skill holds only SKILL.md, scripts/, references/ and assets/',
			".agents/skills/broken: frontmatter may only have name, description and disable-model-invocation; move allowed-tools to the harness adapter",
			".agents/skills/broken: frontmatter name: use lowercase letters, digits and single hyphens",
			".agents/skills/broken: frontmatter description: Too small: expected string to have >=1 characters",
			'.agents/skills/broken: SKILL.md contains a ~/.claude path ("~/.claude"); skills must be harness-neutral',
			'.agents/skills/broken: SKILL.md contains an MCP tool id ("mcp__polar__search"); skills must be harness-neutral',
		]);
	});

	test("reports a name that doesn't match its directory", async () => {
		await writeSkill("alpha", validSkill("beta"));
		await linkSkills(root);

		expect((await checkSkills(root)).errors).toEqual([
			'.agents/skills/alpha: name "beta" must match the directory name "alpha"',
		]);
	});

	test("reports missing frontmatter and a missing SKILL.md", async () => {
		await writeSkill("no-frontmatter", "# Just a heading\n");
		await mkdir(join(root, ".agents", "skills", "empty"), { recursive: true });
		await linkSkills(root);

		expect((await checkSkills(root)).errors).toEqual([
			".agents/skills/empty: SKILL.md is missing",
			".agents/skills/no-frontmatter: SKILL.md must start with a --- frontmatter block",
		]);
	});

	test("skips format checks for upstream skills but still checks their link", async () => {
		await writeSkill(
			"playwright-cli",
			"---\nname: playwright-cli\ndescription: Upstream.\nallowed-tools: Bash(playwright-cli:*)\n---\n",
		);

		expect((await checkSkills(root)).errors).toEqual([
			".claude/skills/playwright-cli: link is missing; run bun run skills:link",
		]);
	});

	test("reports broken, misdirected and non-link adapter entries", async () => {
		await writeSkill("alpha", validSkill("alpha"));
		await writeSkill("beta", validSkill("beta"));
		const adapterDir = join(root, ".claude", "skills");
		await mkdir(join(adapterDir, "local-only"), { recursive: true });
		await symlink("../../.agents/skills/gone", join(adapterDir, "gone"));
		await symlink("../../.agents/skills/beta", join(adapterDir, "alpha"));
		await symlink("../../.agents/skills/beta", join(adapterDir, "beta"));

		const { errors } = await checkSkills(root);

		expect(errors).toHaveLength(3);
		expect(errors).toContain(
			".claude/skills/alpha: points to ../../.agents/skills/beta, expected ../../.agents/skills/alpha; run bun run skills:link",
		);
		expect(errors).toContain(
			".claude/skills/gone: points to ../../.agents/skills/gone, which doesn't exist; run bun run skills:link",
		);
		expect(errors).toContain(
			".claude/skills/local-only: is a real directory, not a link; move it to .agents/skills/local-only and run bun run skills:link",
		);
	});
});
