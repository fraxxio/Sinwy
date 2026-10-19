import {
	lstat,
	mkdir,
	readdir,
	readlink,
	rm,
	stat,
	symlink,
} from "node:fs/promises";
import { join } from "node:path";

export const skillsDir = (root: string) => join(root, ".agents", "skills");
export const claudeSkillsDir = (root: string) =>
	join(root, ".claude", "skills");
export const claudeLinkTarget = (name: string) =>
	`../../.agents/skills/${name}`;

export const resolves = (path: string) =>
	stat(path).then(
		() => true,
		() => false,
	);

export const listSkills = async (root: string) => {
	const entries = await readdir(skillsDir(root), { withFileTypes: true }).catch(
		() => [],
	);
	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
};

export const linkSkills = async (root: string) => {
	const adapterDir = claudeSkillsDir(root);
	await mkdir(adapterDir, { recursive: true });
	const changes: string[] = [];

	for (const name of await listSkills(root)) {
		const linkPath = join(adapterDir, name);
		const target = claudeLinkTarget(name);
		const current = await lstat(linkPath).catch(() => undefined);
		if (current && !current.isSymbolicLink()) {
			throw new Error(
				`.claude/skills/${name} is a real directory, not a link. Move it to .agents/skills/${name} or delete it, then run again.`,
			);
		}
		if (current && (await readlink(linkPath)) === target) continue;
		if (current) await rm(linkPath);
		await symlink(target, linkPath);
		changes.push(`linked .claude/skills/${name} -> ${target}`);
	}

	for (const entry of await readdir(adapterDir, { withFileTypes: true })) {
		const linkPath = join(adapterDir, entry.name);
		if (entry.isSymbolicLink() && !(await resolves(linkPath))) {
			await rm(linkPath);
			changes.push(`removed .claude/skills/${entry.name} (target is gone)`);
		}
	}

	return changes;
};

if (import.meta.main) {
	const changes = await linkSkills(join(import.meta.dir, ".."));
	console.log(
		changes.length > 0 ? changes.join("\n") : "Skill links are up to date.",
	);
}
