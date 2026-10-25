import { lstat, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
	claudeLinkTarget,
	claudeSkillsDir,
	listSkills,
	resolves,
	skillsDir,
} from "./linkSkills";

// Generated upstream and regenerated on upgrade, so only their adapter links are checked.
const upstreamSkills = new Set(["playwright-cli"]);

const allowedEntries = new Set(["SKILL.md", "scripts", "references", "assets"]);
// disable-model-invocation is the one harness key allowed: it keeps a user-only
// skill out of the agent's skill list, and other harnesses ignore it.
const allowedKeys = new Set([
	"name",
	"description",
	"disable-model-invocation",
]);

const harnessOnlyPatterns = [
	{ pattern: /~\/\.claude\b/, label: "a ~/.claude path" },
	{ pattern: /\bmcp__\w+/, label: "an MCP tool id" },
];

const frontmatterSchema = z.object({
	name: z
		.string()
		.max(64)
		.regex(
			/^[a-z0-9]+(-[a-z0-9]+)*$/,
			"use lowercase letters, digits and single hyphens",
		),
	description: z.string().trim().min(1).max(1024),
	"disable-model-invocation": z.boolean().optional(),
});

const parseFrontmatter = (content: string) => {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
	if (match?.[1] === undefined) {
		return { error: "SKILL.md must start with a --- frontmatter block" };
	}
	try {
		return { data: Bun.YAML.parse(match[1]) };
	} catch (error) {
		return { error: `frontmatter is not valid YAML: ${String(error)}` };
	}
};

const checkFormat = async (root: string, name: string) => {
	const dir = join(skillsDir(root), name);
	const errors: string[] = [];

	for (const entry of await readdir(dir)) {
		if (!allowedEntries.has(entry)) {
			errors.push(
				`unexpected "${entry}"; a skill holds only SKILL.md, scripts/, references/ and assets/`,
			);
		}
	}

	const skillFile = Bun.file(join(dir, "SKILL.md"));
	if (!(await skillFile.exists())) return [...errors, "SKILL.md is missing"];

	const frontmatter = parseFrontmatter(await skillFile.text());
	if (frontmatter.error !== undefined) return [...errors, frontmatter.error];

	const data: unknown = frontmatter.data;
	if (typeof data === "object" && data !== null) {
		const extraKeys = Object.keys(data).filter((key) => !allowedKeys.has(key));
		if (extraKeys.length > 0) {
			errors.push(
				`frontmatter may only have name, description and disable-model-invocation; move ${extraKeys.join(", ")} to the harness adapter`,
			);
		}
	}

	const parsed = frontmatterSchema.safeParse(data);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			errors.push(
				`frontmatter ${issue.path.join(".") || "block"}: ${issue.message}`,
			);
		}
	} else if (parsed.data.name !== name) {
		errors.push(
			`name "${parsed.data.name}" must match the directory name "${name}"`,
		);
	}

	for await (const file of new Bun.Glob("**/*.md").scan({ cwd: dir })) {
		const text = await Bun.file(join(dir, file)).text();
		for (const { pattern, label } of harnessOnlyPatterns) {
			const found = text.match(pattern);
			if (found) {
				errors.push(
					`${file} contains ${label} ("${found[0]}"); skills must be harness-neutral`,
				);
			}
		}
	}

	return errors;
};

const checkClaudeLinks = async (root: string, skills: string[]) => {
	const errors: string[] = [];
	const adapterDir = claudeSkillsDir(root);
	const fix = "run bun run skills:link";

	for (const name of skills) {
		if (!(await lstat(join(adapterDir, name)).catch(() => undefined))) {
			errors.push(`.claude/skills/${name}: link is missing; ${fix}`);
		}
	}

	const entries = await readdir(adapterDir, { withFileTypes: true }).catch(
		() => [],
	);
	for (const entry of entries) {
		const linkPath = join(adapterDir, entry.name);
		const label = `.claude/skills/${entry.name}`;
		if (!entry.isSymbolicLink()) {
			errors.push(
				`${label}: is a real directory, not a link; move it to .agents/skills/${entry.name} and ${fix}`,
			);
			continue;
		}
		const target = await readlink(linkPath);
		if (!(await resolves(linkPath))) {
			errors.push(`${label}: points to ${target}, which doesn't exist; ${fix}`);
		} else if (target !== claudeLinkTarget(entry.name)) {
			errors.push(
				`${label}: points to ${target}, expected ${claudeLinkTarget(entry.name)}; ${fix}`,
			);
		}
	}

	return errors;
};

export const checkSkills = async (root: string) => {
	const errors: string[] = [];

	const entries = await readdir(skillsDir(root), { withFileTypes: true }).catch(
		() => [],
	);
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			errors.push(
				`.agents/skills/${entry.name}: each skill must be a directory`,
			);
		}
	}

	const skills = await listSkills(root);
	for (const name of skills) {
		if (upstreamSkills.has(name)) continue;
		for (const error of await checkFormat(root, name)) {
			errors.push(`.agents/skills/${name}: ${error}`);
		}
	}

	errors.push(...(await checkClaudeLinks(root, skills)));
	return { skills, errors };
};

if (import.meta.main) {
	const { skills, errors } = await checkSkills(join(import.meta.dir, ".."));
	if (errors.length > 0) {
		console.error(
			`Skill check failed:\n${errors.map((error) => `  - ${error}`).join("\n")}`,
		);
		process.exit(1);
	}
	const upstream = skills.filter((name) => upstreamSkills.has(name));
	console.log(
		`${skills.length} skill(s) OK${upstream.length > 0 ? ` (format checks skipped for upstream: ${upstream.join(", ")})` : ""}.`,
	);
}
